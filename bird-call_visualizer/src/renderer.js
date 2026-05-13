import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from './config.js';
import { Labels } from './labels.js';

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

// Map a dominant frequency (Hz) to a THREE.Color by interpolating between
// the stops defined in CONFIG.colorScale.
function freqToColor(freqHz) {
  const scale = CONFIG.colorScale;
  const first = scale[0];
  const last  = scale[scale.length - 1];

  if (freqHz <= first.freq) return new THREE.Color(first.hex);
  if (freqHz >= last.freq)  return new THREE.Color(last.hex);

  for (let i = 0; i < scale.length - 1; i++) {
    const lo = scale[i], hi = scale[i + 1];
    if (freqHz >= lo.freq && freqHz <= hi.freq) {
      const t = (freqHz - lo.freq) / (hi.freq - lo.freq);
      return new THREE.Color(lo.hex).lerp(new THREE.Color(hi.hex), t);
    }
  }
  return new THREE.Color(last.hex);
}

// ---------------------------------------------------------------------------
// Coordinate mapping
// ---------------------------------------------------------------------------

// Map a point's named feature to a scene coordinate along one axis.
// Uses CONFIG.featureRanges for normalization and CONFIG.axisScale for output range.
function mapFeatureToAxis(value, featureKey, [sceneMin, sceneMax]) {
  const [fMin, fMax] = CONFIG.featureRanges[featureKey];
  const t = fMax > fMin ? Math.max(0, Math.min(1, (value - fMin) / (fMax - fMin))) : 0;
  return sceneMin + t * (sceneMax - sceneMin);
}

// Convert a point object (with named audio features) to a Three.js Vector3
// using the axis mapping in CONFIG.axes.
function pointToScene(point) {
  const { axes, axisScale } = CONFIG;
  return new THREE.Vector3(
    mapFeatureToAxis(point[axes.x], axes.x, axisScale.x),
    mapFeatureToAxis(point[axes.y], axes.y, axisScale.y),
    mapFeatureToAxis(point[axes.z], axes.z, axisScale.z),
  );
}

// Map a normalized amplitude (0..1) to a rendered point size in pixels.
function ampToSize(normAmp) {
  const { min, max } = CONFIG.pointSize;
  return min + normAmp * (max - min);
}

// ---------------------------------------------------------------------------
// Buffer limits
// ---------------------------------------------------------------------------

const MAX_POINTS     = 15_000;           // max points per panel
const MAX_LINE_VERTS = 120_000;          // 2 verts per segment → 60k segments max

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class Renderer {
  #container;
  #scene;
  #camera;
  #glRenderer;
  #controls;
  #labels;
  #resizeObserver;
  #rafId;

  // Points
  #pointsGeo;
  #posArr;
  #colArr;
  #sizeArr;
  #pointCount = 0;

  // Lines
  #linesGeo;
  #linePosArr;
  #lineVertCount = 0;

  // Incremental playback state (set by loadPoints, consumed by playTo)
  #allPoints     = [];   // full original point array
  #scenePositions = [];  // pre-computed Vector3 per point (uses normalised amplitude)
  #fileMaxAmp    = 1;    // 1 / max(amplitude) for the loaded file
  #cursor        = 0;    // index of the next point not yet added to the scene

  constructor(container) {
    this.#container = container;

    // Use at-least-1-pixel dimensions so setSize and aspect-ratio math are
    // valid even when the container is initially hidden (display: none) in
    // single-panel mode. The ResizeObserver will provide real dimensions
    // as soon as the container becomes visible.
    const w0 = Math.max(container.clientWidth,  1);
    const h0 = Math.max(container.clientHeight, 1);

    // WebGL renderer.
    this.#glRenderer = new THREE.WebGLRenderer({ antialias: true });
    this.#glRenderer.setPixelRatio(window.devicePixelRatio);
    this.#glRenderer.setClearColor(0x000000);
    this.#glRenderer.setSize(w0, h0);
    container.appendChild(this.#glRenderer.domElement);

    // Scene.
    this.#scene = new THREE.Scene();

    // Camera — positioned to see the full default volume:
    //   X: [-5, 5]  Y: [0, 4]  Z: [-3, 3]
    this.#camera = new THREE.PerspectiveCamera(60, w0 / h0, 0.01, 1000);
    this.#camera.position.set(0, 2, 14);

    // Orbit controls — orbit around the centre of the cloud volume.
    this.#controls = new OrbitControls(this.#camera, this.#glRenderer.domElement);
    this.#controls.target.set(0, 2, 0);
    this.#controls.enableDamping  = true;
    this.#controls.dampingFactor  = 0.08;
    this.#controls.update();

    // --- Labels ---
    this.#labels = new Labels(container, this.#scene, this.#camera);

    // --- Point cloud ---
    this.#posArr  = new Float32Array(MAX_POINTS * 3);
    this.#colArr  = new Float32Array(MAX_POINTS * 3);
    this.#sizeArr = new Float32Array(MAX_POINTS);

    this.#pointsGeo = new THREE.BufferGeometry();
    this.#pointsGeo.setAttribute('position', new THREE.BufferAttribute(this.#posArr,  3));
    this.#pointsGeo.setAttribute('color',    new THREE.BufferAttribute(this.#colArr,  3));
    this.#pointsGeo.setAttribute('size',     new THREE.BufferAttribute(this.#sizeArr, 1));
    this.#pointsGeo.setDrawRange(0, 0);

    // ShaderMaterial gives us per-point size (PointsMaterial only supports one
    // size for the whole mesh).
    const pointsMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        attribute vec3  color;
        varying   vec3  vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size;
          gl_Position  = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = 1.0 - smoothstep(0.2, 0.5, r);
          gl_FragColor = vec4(vColor, a);
        }
      `,
      transparent: true,
      depthWrite:  false,
    });

    this.#scene.add(new THREE.Points(this.#pointsGeo, pointsMat));

    // --- Connecting lines ---
    this.#linePosArr = new Float32Array(MAX_LINE_VERTS * 3);
    this.#linesGeo   = new THREE.BufferGeometry();
    this.#linesGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.#linePosArr, 3),
    );
    this.#linesGeo.setDrawRange(0, 0);

    const linesMat = new THREE.LineBasicMaterial({
      color:       0xffffff,
      opacity:     0.35,
      transparent: true,
    });
    this.#scene.add(new THREE.LineSegments(this.#linesGeo, linesMat));

    // --- Resize ---
    // Use the entry's contentRect rather than re-reading clientWidth — it's
    // the size the browser actually laid out for this frame, and avoids
    // edge cases where clientWidth lags behind the observed resize.
    this.#resizeObserver = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      this.#resizeTo(cr.width, cr.height);
    });
    this.#resizeObserver.observe(container);

    // --- Render loop ---
    this.#loop();
  }

  // Public: force a resize based on the container's current size.
  // Useful when the layout changes via a class toggle (e.g. single → split
  // mode) — ResizeObserver normally catches this, but calling explicitly
  // guarantees the buffer and camera aspect are in sync on the next frame.
  resize() {
    this.#resizeTo(this.#container.clientWidth, this.#container.clientHeight);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  // Batch-render a complete point array.
  //
  // Normalises amplitude per file (so the loudest point always hits pointSize.max)
  // and builds neighbour lines in one pass. Intended for offline pre-analysed data.
  //
  // O(n²) neighbour search is acceptable here because this runs once per file load
  // (not every frame). For large files (>5k points) expect 100–500 ms.
  render(points) {
    this.clear();
    if (points.length === 0) return;

    // Per-file amplitude normalisation.
    let maxAmp = 0;
    for (const p of points) if (p.amplitude > maxAmp) maxAmp = p.amplitude;
    const normFactor = maxAmp > 0 ? 1 / maxAmp : 1;

    // --- Fill point buffers and collect scene positions for line pass. ---
    const scenePos = new Array(points.length);

    for (let i = 0; i < points.length; i++) {
      const p      = points[i];
      const normAmp = p.amplitude * normFactor;
      const v      = pointToScene({ ...p, amplitude: normAmp });
      const color  = freqToColor(p.dominantFreq);

      this.#posArr[i * 3]     = v.x;
      this.#posArr[i * 3 + 1] = v.y;
      this.#posArr[i * 3 + 2] = v.z;
      this.#colArr[i * 3]     = color.r;
      this.#colArr[i * 3 + 1] = color.g;
      this.#colArr[i * 3 + 2] = color.b;
      this.#sizeArr[i]        = ampToSize(normAmp);
      scenePos[i]             = v;

      // Pass original (unnormalised) point for display values, scene position
      // for placement. Labels show what the audio measured, not the scaled value.
      this.#labels.add(points[i], v);
    }

    this.#pointCount = points.length;
    this.#pointsGeo.attributes.position.needsUpdate = true;
    this.#pointsGeo.attributes.color.needsUpdate    = true;
    this.#pointsGeo.attributes.size.needsUpdate     = true;
    this.#pointsGeo.setDrawRange(0, this.#pointCount);
    this.#pointsGeo.computeBoundingSphere();

    // --- Build neighbour lines. ---
    const threshSq = CONFIG.lineNeighborDistance ** 2;
    let lv = 0; // float index into linePosArr; lv/3 = vertex count

    outer: for (let i = 0; i < scenePos.length; i++) {
      const a = scenePos[i];
      for (let j = i + 1; j < scenePos.length; j++) {
        if (lv + 6 > this.#linePosArr.length) break outer;
        if (a.distanceToSquared(scenePos[j]) < threshSq) {
          const b = scenePos[j];
          this.#linePosArr[lv++] = a.x;
          this.#linePosArr[lv++] = a.y;
          this.#linePosArr[lv++] = a.z;
          this.#linePosArr[lv++] = b.x;
          this.#linePosArr[lv++] = b.y;
          this.#linePosArr[lv++] = b.z;
        }
      }
    }

    this.#lineVertCount = lv / 3;
    this.#linesGeo.attributes.position.needsUpdate = true;
    this.#linesGeo.setDrawRange(0, this.#lineVertCount);
    this.#linesGeo.computeBoundingSphere();

    console.log(
      `[renderer] ${this.#pointCount} points, ${this.#lineVertCount / 2} lines`,
    );
  }

  // ---------------------------------------------------------------------------
  // Incremental playback API
  // ---------------------------------------------------------------------------

  // Pre-process a full point array for incremental playback.
  // Computes the per-file amplitude normalisation factor and all scene
  // positions upfront so playTo() can run cheaply every frame.
  // Does NOT render anything — call playTo() to start adding points.
  loadPoints(points) {
    this.clear();
    if (points.length === 0) return;

    this.#allPoints = points;

    let maxAmp = 0;
    for (const p of points) if (p.amplitude > maxAmp) maxAmp = p.amplitude;
    this.#fileMaxAmp = maxAmp > 0 ? 1 / maxAmp : 1;

    // Pre-compute scene positions using the normalised amplitude so the Y
    // axis (amplitude) is scaled consistently with the batch render() path.
    this.#scenePositions = points.map(p =>
      pointToScene({ ...p, amplitude: p.amplitude * this.#fileMaxAmp }),
    );
  }

  // Add all points whose emissionTime <= timeSeconds that haven't been
  // added yet, then flush the updated buffers to the GPU in one batch.
  // Safe to call every frame — exits immediately if nothing changed.
  playTo(timeSeconds) {
    let added = 0;
    while (
      this.#cursor < this.#allPoints.length &&
      this.#allPoints[this.#cursor].emissionTime <= timeSeconds
    ) {
      this.#addPointIncremental(this.#cursor);
      this.#cursor++;
      added++;
    }
    if (added === 0) return;

    this.#pointsGeo.attributes.position.needsUpdate = true;
    this.#pointsGeo.attributes.color.needsUpdate    = true;
    this.#pointsGeo.attributes.size.needsUpdate     = true;
    this.#pointsGeo.setDrawRange(0, this.#pointCount);
    this.#pointsGeo.computeBoundingSphere();

    this.#linesGeo.attributes.position.needsUpdate = true;
    this.#linesGeo.setDrawRange(0, this.#lineVertCount);
    this.#linesGeo.computeBoundingSphere();
  }

  // ---------------------------------------------------------------------------
  // Batch API (kept for test pages and future use)
  // ---------------------------------------------------------------------------

  // Remove all points, lines, and labels without deallocating GPU buffers.
  clear() {
    this.#pointCount    = 0;
    this.#lineVertCount = 0;
    this.#cursor        = 0;
    this.#allPoints     = [];
    this.#scenePositions = [];
    this.#fileMaxAmp    = 1;
    this.#pointsGeo.setDrawRange(0, 0);
    this.#linesGeo.setDrawRange(0, 0);
    this.#labels.clear();
  }

  // Toggle label visibility. Returns true if labels are now visible.
  toggleLabels() {
    return this.#labels.toggle();
  }

  // Free GPU resources. Call when removing a panel.
  dispose() {
    cancelAnimationFrame(this.#rafId);
    this.#resizeObserver.disconnect();
    this.#controls.dispose();
    this.#glRenderer.dispose();
    this.#pointsGeo.dispose();
    this.#linesGeo.dispose();
    this.#labels.dispose();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  // Write one point into the pre-allocated buffers and find its neighbours
  // among all previously added points. O(i) per call — total O(n²) over a
  // full file, spread across frames rather than paid all at once.
  #addPointIncremental(i) {
    const p       = this.#allPoints[i];
    const normAmp = p.amplitude * this.#fileMaxAmp;
    const v       = this.#scenePositions[i];
    const color   = freqToColor(p.dominantFreq);

    this.#posArr[i * 3]     = v.x;
    this.#posArr[i * 3 + 1] = v.y;
    this.#posArr[i * 3 + 2] = v.z;
    this.#colArr[i * 3]     = color.r;
    this.#colArr[i * 3 + 1] = color.g;
    this.#colArr[i * 3 + 2] = color.b;
    this.#sizeArr[i]        = ampToSize(normAmp);
    this.#pointCount++;

    const threshSq = CONFIG.lineNeighborDistance ** 2;
    for (let j = 0; j < i; j++) {
      if (this.#lineVertCount + 2 > MAX_LINE_VERTS) break;
      if (v.distanceToSquared(this.#scenePositions[j]) < threshSq) {
        const b  = this.#scenePositions[j];
        const lv = this.#lineVertCount * 3;
        this.#linePosArr[lv]     = v.x;
        this.#linePosArr[lv + 1] = v.y;
        this.#linePosArr[lv + 2] = v.z;
        this.#linePosArr[lv + 3] = b.x;
        this.#linePosArr[lv + 4] = b.y;
        this.#linePosArr[lv + 5] = b.z;
        this.#lineVertCount += 2;
      }
    }

    this.#labels.add(p, v);
  }

  #resizeTo(w, h) {
    if (w <= 0 || h <= 0) return;
    this.#camera.aspect = w / h;
    this.#camera.updateProjectionMatrix();
    this.#glRenderer.setSize(w, h);
    this.#labels.setSize(w, h);
  }

  #loop() {
    this.#rafId = requestAnimationFrame(() => this.#loop());
    this.#controls.update();
    this.#glRenderer.render(this.#scene, this.#camera);
    // CSS2DRenderer must render after WebGL so label positions are current.
    this.#labels.render();
  }
}

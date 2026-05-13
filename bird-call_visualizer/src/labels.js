import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Manages floating per-point text labels rendered via CSS2DRenderer.
//
// Labels are HTML <div>s projected into 3D space. They are separate from the
// WebGL scene but share the same Scene graph and Camera so they stay attached
// to their points as the user orbits.
//
// Toggle visibility with toggle(). The CSS2DRenderer overlay sits on top of
// the WebGL canvas; pointer-events are disabled so orbit controls still work.

export class Labels {
  #cssRenderer;
  #scene;
  #camera;
  #container;
  #objects = [];
  #visible = true;

  constructor(container, scene, camera) {
    this.#container = container;
    this.#scene     = scene;
    this.#camera    = camera;

    this.#cssRenderer = new CSS2DRenderer();
    this.#cssRenderer.setSize(container.clientWidth, container.clientHeight);

    const el = this.#cssRenderer.domElement;
    el.style.position      = 'absolute';
    el.style.top           = '0';
    el.style.left          = '0';
    el.style.pointerEvents = 'none';
    container.appendChild(el);
  }

  // Add a label for one point. Receives the original (unnormalised) point data
  // so the displayed values reflect actual audio measurements, and the
  // pre-computed scene-space Vector3 so the div tracks the rendered dot.
  add(point, scenePosition) {
    const div = document.createElement('div');
    div.className = 'point-label';
    div.innerHTML =
      `<b>${point.amplitude.toFixed(4)}</b>` +
      `<span>${point.centroid.toFixed(2)}k</span>` +
      `<span>${point.emissionTime.toFixed(2)}s</span>`;

    const obj = new CSS2DObject(div);
    obj.position.copy(scenePosition);
    this.#scene.add(obj);
    this.#objects.push(obj);
  }

  // Remove all labels from the scene and DOM.
  clear() {
    for (const obj of this.#objects) {
      this.#scene.remove(obj);
      obj.element.remove();
    }
    this.#objects = [];
  }

  // Show / hide the entire label overlay. Returns the new visibility state.
  toggle() {
    this.#visible = !this.#visible;
    this.#cssRenderer.domElement.style.display = this.#visible ? '' : 'none';
    return this.#visible;
  }

  // Call once per animation frame, after the WebGL renderer has rendered.
  render() {
    this.#cssRenderer.render(this.#scene, this.#camera);
  }

  setSize(w, h) {
    this.#cssRenderer.setSize(w, h);
  }

  dispose() {
    this.clear();
    this.#cssRenderer.domElement.remove();
  }
}

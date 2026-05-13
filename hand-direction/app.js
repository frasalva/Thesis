const CONFIG = {
  world:       { width: 4000, height: 2500 },
  player:      { speed: 180, reachRadius: 60 },
  pull:        { magnitude: 14, distanceFalloff: 600 },
  parallax:    16,
  steerRate:   3.6,
  arrowSmoothing:       10,
  playerAngleSmoothing: 6,
  tractionSmoothing:    6,
  wanderRate:  0.78,
  spawn: {
    edgeMargin: 0.1,     // keep new birds away from world borders
    minSpacingFrac: 0.3, // min distance between consecutive birds, as fraction of min(world dim)
    maxTries: 20,
  },
  trail: {
    curveAmount:    0.55,  // perpendicular offset of bezier control point, fraction of segment length
    segments:       40,    // number of sub-segments used to fake a gradient stroke
    minFade:        0.22,  // when far from current bird: only this fraction of the trail is visible
    maxFade:        1.0,   // when touching: trail is fully visible (next bird shown)
    revealStart:    1200,  // distance at which the trail starts opening up beyond minFade
    nextRevealAt:   0.88,  // fadeEnd value at which the next bird begins to appear
    revealHold:     0.45,  // seconds to hold the fully-revealed state at touch before advancing
    historyEdge:    0.15,  // soft width of the erase front sweeping along the history trail
  },
};

(() => {
  // ── World ──────────────────────────────────────────
  function randomTarget(awayFrom) {
    const { width, height } = CONFIG.world;
    const { edgeMargin: m, minSpacingFrac, maxTries } = CONFIG.spawn;
    const minDist = Math.min(width, height) * minSpacingFrac;
    for (let i = 0; i < maxTries; i++) {
      const x = (m + Math.random() * (1 - 2 * m)) * width;
      const y = (m + Math.random() * (1 - 2 * m)) * height;
      if (!awayFrom || Math.hypot(x - awayFrom.x, y - awayFrom.y) >= minDist) {
        return { x, y };
      }
    }
    return {
      x: (m + Math.random() * (1 - 2 * m)) * width,
      y: (m + Math.random() * (1 - 2 * m)) * height,
    };
  }

  // Project a trajectory forward from `from`: pick a heading and a step length, bend it with a
  // perpendicular control offset, and let the endpoint be where the next bird will land. The
  // trail is the prediction; the next bird's position is derived from it, not the other way
  // around.
  function planTrajectory(from) {
    const { width, height } = CONFIG.world;
    const { edgeMargin: m, minSpacingFrac, maxTries } = CONFIG.spawn;
    const minDim = Math.min(width, height);
    const minDist = minDim * minSpacingFrac;
    const maxDist = minDim * (minSpacingFrac + 0.4);

    let end;
    for (let i = 0; i < maxTries; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = minDist + Math.random() * (maxDist - minDist);
      const ex = from.x + Math.cos(angle) * dist;
      const ey = from.y + Math.sin(angle) * dist;
      if (ex < m * width  || ex > (1 - m) * width)  continue;
      if (ey < m * height || ey > (1 - m) * height) continue;
      end = { x: ex, y: ey };
      break;
    }
    if (!end) end = randomTarget(from); // fallback: directionless but always in-bounds

    const mx = (from.x + end.x) / 2;
    const my = (from.y + end.y) / 2;
    const dx = end.x - from.x;
    const dy = end.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const perpX = -dy / len;
    const perpY =  dx / len;
    const offset = (Math.random() - 0.5) * len * CONFIG.trail.curveAmount * 2;
    const control = { x: mx + perpX * offset, y: my + perpY * offset };

    return { end, control };
  }

  const world = {
    width:  CONFIG.world.width,
    height: CONFIG.world.height,
    player: { x: CONFIG.world.width / 2, y: CONFIG.world.height / 2 },
    previous: null,        // bird just caught (start of the history trail)
    previousControl: null, // control point of the history trail (previous → current)
    current: null,
    next: null,
    control: null,
    caught: 0,
  };
  world.current = randomTarget(world.player);
  const firstPlan = planTrajectory(world.current);
  world.next    = firstPlan.end;
  world.control = firstPlan.control;

  // ── DOM refs ───────────────────────────────────────
  const compass    = document.getElementById('compass');
  const arrowOrbit = document.getElementById('arrowOrbit');
  const traction   = document.getElementById('traction');
  const meta       = document.getElementById('meta');
  const minimap    = document.getElementById('minimap');
  const modeToggle = document.getElementById('modeToggle');
  const modeLabel  = modeToggle.querySelector('.label');
  const ctx        = minimap.getContext('2d');

  const setRadiusVar = () => {
    document.documentElement.style.setProperty('--radius', compass.clientWidth / 2 + 'px');
  };
  setRadiusVar();
  window.addEventListener('resize', setRadiusVar);

  // ── Input ──────────────────────────────────────────
  let mode = 'auto'; // 'auto' | 'cursor'
  const cursor = { x: 0, y: 0, active: false };

  function setMode(next) {
    mode = next;
    modeLabel.textContent = mode === 'auto' ? '◎ AUTO' : '✦ CURSOR';
    modeToggle.classList.toggle('cursor', mode === 'cursor');
    if (mode === 'auto') cursor.active = false;
  }
  const toggleMode = () => setMode(mode === 'auto' ? 'cursor' : 'auto');

  modeToggle.addEventListener('click', () => {
    toggleMode();
    modeToggle.blur(); // so subsequent Space keydown doesn't also click the button
  });
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      toggleMode();
    }
  });

  // Cursor tracking is document-wide so steering keeps working past the ring/compass.
  document.addEventListener('pointermove', e => {
    if (mode !== 'cursor') return;
    const rect = compass.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top  + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      cursor.x = dx / len;
      cursor.y = dy / len;
      cursor.active = true;
    }
  });

  setMode('auto');

  // ── Helpers ────────────────────────────────────────
  // Wrap an angle delta into [-π, π] so smoothing always takes the short way around.
  const wrapAngle = a => {
    while (a >  Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  };

  function advanceTarget() {
    // Preserve the trail we just fully revealed as the history line from the bird we caught
    // to the new current. It stays visible while the player traverses it.
    world.previous        = world.current;
    world.previousControl = world.control;
    world.current = world.next;
    const plan = planTrajectory(world.current);
    world.next    = plan.end;
    world.control = plan.control;
    world.caught++;
  }

  function reachPulse() {
    const el = document.createElement('div');
    el.className = 'reach-pulse';
    compass.appendChild(el);
    setTimeout(() => el.remove(), 750);
  }

  // ── State ──────────────────────────────────────────
  let arrowAngle    = 0;
  let tractionAngle = 0;
  let playerAngle   = 0;
  let wanderSeed    = 0;
  let terrainX = 0, terrainY = 0;
  const velocity = { x: 0, y: 0 };

  let phase = 'chasing';   // 'chasing' | 'revealing'
  let revealTimer = 0;     // seconds remaining in the post-touch reveal hold

  function fadeFromDistance(distance) {
    const { minFade, maxFade, revealStart } = CONFIG.trail;
    const close = CONFIG.player.reachRadius;
    if (distance <= close)       return maxFade;
    if (distance >= revealStart) return minFade;
    const t = (distance - close) / (revealStart - close);
    return maxFade + (minFade - maxFade) * t;
  }

  // ── Loop ───────────────────────────────────────────
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    const t = world.current;
    const tdx = t.x - world.player.x;
    const tdy = t.y - world.player.y;
    const distance = Math.hypot(tdx, tdy);

    // Arrow: snap to cursor when steering manually, otherwise drift toward active bird.
    // Use wrapped delta so arrowAngle stays continuous across the ±π seam — otherwise the CSS
    // transition on .arrow-orbit interpolates linearly and takes the long way around the circle.
    if (cursor.active) {
      const targetAngle = Math.atan2(cursor.y, cursor.x);
      arrowAngle += wrapAngle(targetAngle - arrowAngle);
    } else {
      wanderSeed += dt * CONFIG.wanderRate;
      const wanderOffset = Math.sin(wanderSeed * 0.9) * 0.34 + Math.sin(wanderSeed * 1.4) * 0.17;
      const directionAngle = Math.atan2(tdy, tdx) + wanderOffset;
      arrowAngle += wrapAngle(directionAngle - arrowAngle) * Math.min(1, dt * CONFIG.arrowSmoothing);
    }

    // Steer velocity toward arrow direction (smooth) then normalize so speed stays constant.
    const desired = { x: Math.cos(arrowAngle), y: Math.sin(arrowAngle) };
    const steer = Math.min(1, dt * CONFIG.steerRate);
    velocity.x += (desired.x - velocity.x) * steer;
    velocity.y += (desired.y - velocity.y) * steer;
    const vLen = Math.hypot(velocity.x, velocity.y);
    if (vLen > 0.001) {
      velocity.x /= vLen;
      velocity.y /= vLen;
    }

    world.player.x = Math.max(0, Math.min(world.width,  world.player.x + velocity.x * CONFIG.player.speed * dt));
    world.player.y = Math.max(0, Math.min(world.height, world.player.y + velocity.y * CONFIG.player.speed * dt));

    terrainX -= velocity.x * CONFIG.parallax * dt;
    terrainY -= velocity.y * CONFIG.parallax * dt;
    compass.style.backgroundPosition = `0 0, ${terrainX}px ${terrainY}px`;

    // Player heading lags velocity so the minimap triangle rotates smoothly.
    if (Math.hypot(velocity.x, velocity.y) > 0.001) {
      const newPlayerAngle = Math.atan2(velocity.y, velocity.x);
      playerAngle += wrapAngle(newPlayerAngle - playerAngle) * Math.min(1, dt * CONFIG.playerAngleSmoothing);
    }

    // Pull the arrow back toward the player's actual heading so it shows direction of motion,
    // not raw cursor intent. Cursor snap above wins on the first frame; this drags it after.
    arrowAngle += wrapAngle(playerAngle - arrowAngle) * Math.min(1, dt * CONFIG.arrowSmoothing);
    arrowOrbit.style.transform = `translate(-50%, -50%) rotate(${arrowAngle + Math.PI / 2}rad)`;

    // Traction (red look-ahead dot): leads the player in the direction we're steering.
    const tractionTarget = cursor.active ? Math.atan2(cursor.y, cursor.x) : arrowAngle;
    tractionAngle += wrapAngle(tractionTarget - tractionAngle) * Math.min(1, dt * CONFIG.tractionSmoothing);

    const pullMag = cursor.active
      ? CONFIG.pull.magnitude
      : Math.min(1, distance / CONFIG.pull.distanceFalloff) * CONFIG.pull.magnitude;

    const ox = Math.cos(tractionAngle) * pullMag;
    const oy = Math.sin(tractionAngle) * pullMag;
    traction.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;

    // Phase transitions: on touch hold the fully-revealed state briefly so the player can see
    // the trail complete and the next bird appear, then advance.
    let fadeEnd;
    if (phase === 'revealing') {
      fadeEnd = CONFIG.trail.maxFade;
      revealTimer -= dt;
      if (revealTimer <= 0) {
        advanceTarget();
        phase = 'chasing';
      }
    } else {
      fadeEnd = fadeFromDistance(distance);
      if (distance < CONFIG.player.reachRadius) {
        phase = 'revealing';
        revealTimer = CONFIG.trail.revealHold;
        reachPulse();
      }
    }

    // History-trail erase progress: 0 when player just left `previous`, 1 when at `current`.
    let historyProgress = 1;
    if (world.previous) {
      const totalDist = Math.hypot(
        world.current.x - world.previous.x,
        world.current.y - world.previous.y
      );
      if (totalDist > 0) {
        historyProgress = Math.max(0, Math.min(1, 1 - distance / totalDist));
      }
    }

    meta.textContent = `${Math.round(distance)} m · ◎ ${String(world.caught).padStart(2,'0')} · ${mode.toUpperCase()}`;

    drawMinimap(fadeEnd, historyProgress);
    requestAnimationFrame(loop);
  }

  // ── Minimap ────────────────────────────────────────
  function bezier(p0, p1, p2, t) {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    };
  }

  // Canvas can't gradient-stroke a path natively, so we sample the bezier and emit short
  // segments with decreasing alpha. fadeEnd is the fraction of the trail that's visible —
  // it grows from minFade (far) to maxFade=1 (touching), so the trail unwraps as we approach.
  function drawFadingTrail(from, control, to, sx, sy, fadeEnd) {
    const { segments } = CONFIG.trail;
    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < segments; i++) {
      const t1 = i / segments;
      const t2 = (i + 1) / segments;
      const tMid = (t1 + t2) / 2;
      if (tMid >= fadeEnd) break;
      const alpha = 1 - tMid / fadeEnd;
      const p1 = bezier(from, control, to, t1);
      const p2 = bezier(from, control, to, t2);
      ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.55})`;
      ctx.beginPath();
      ctx.moveTo(p1.x * sx, p1.y * sy);
      ctx.lineTo(p2.x * sx, p2.y * sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // History trail from the previously caught bird to the current one. Segments behind the
  // player's progress along the trail are erased — the previous-bird end disappears first
  // and the erase front sweeps toward the current bird as the player gets closer to it.
  function drawHistoryTrail(from, control, to, sx, sy, progress) {
    const { segments, historyEdge } = CONFIG.trail;
    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < segments; i++) {
      const t1 = i / segments;
      const t2 = (i + 1) / segments;
      const tMid = (t1 + t2) / 2;
      const alpha = Math.max(0, Math.min(1, (tMid - progress) / historyEdge + 1));
      if (alpha <= 0) continue;
      const p1 = bezier(from, control, to, t1);
      const p2 = bezier(from, control, to, t2);
      ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.45})`;
      ctx.beginPath();
      ctx.moveTo(p1.x * sx, p1.y * sy);
      ctx.lineTo(p2.x * sx, p2.y * sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMinimap(fadeEnd, historyProgress) {
    const W = minimap.width, H = minimap.height;
    ctx.fillStyle = '#030303';
    ctx.fillRect(0, 0, W, H);

    const sx = W / world.width;
    const sy = H / world.height;

    if (world.previous && world.previousControl && world.current) {
      drawHistoryTrail(world.previous, world.previousControl, world.current, sx, sy, historyProgress);
    }

    if (world.current && world.next && world.control) {
      drawFadingTrail(world.current, world.control, world.next, sx, sy, fadeEnd);
    }

    if (world.current) drawBird(world.current.x * sx, world.current.y * sy);

    // Next bird fades in only as the trail nearly completes — it's hidden until touch.
    if (world.next) {
      const { nextRevealAt, maxFade } = CONFIG.trail;
      const t = (fadeEnd - nextRevealAt) / (maxFade - nextRevealAt);
      if (t > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, t);
        drawBird(world.next.x * sx, world.next.y * sy);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(world.player.x * sx, world.player.y * sy);
    ctx.rotate(playerAngle + Math.PI / 2);
    ctx.shadowColor = 'rgba(255,255,255,0.22)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBird(x, y) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = '#e4524a';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-9, 1);
    ctx.quadraticCurveTo(-5, -5, 0, 0);
    ctx.quadraticCurveTo( 5, -5, 9, 1);
    ctx.stroke();

    ctx.restore();
  }

  requestAnimationFrame(loop);
})();

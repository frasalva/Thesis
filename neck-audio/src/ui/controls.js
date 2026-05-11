// Wires the Play Audio / Allow mic buttons to the AudioEngine.

export function initControls(engine, { onSourceChange } = {}) {
  const playBtn = document.getElementById('btn-play');
  const micBtn = document.getElementById('btn-mic');

  const playLabel = playBtn.querySelector('.label');

  const setActive = (btn, active) => btn.classList.toggle('is-active', active);

  const refresh = () => {
    const src = engine.currentSource();
    setActive(playBtn, src === 'demo');
    setActive(micBtn, src === 'mic');
    playLabel.textContent = src === 'demo' ? 'Stop Audio' : 'Play Audio';
    if (onSourceChange) onSourceChange(src);
  };

  playBtn.addEventListener('click', async () => {
    try {
      if (engine.currentSource() === 'demo') {
        engine.stop();
      } else {
        await engine.startDemo();
      }
    } catch (err) {
      console.error('Failed to start demo audio:', err);
    }
    refresh();
  });

  micBtn.addEventListener('click', async () => {
    try {
      if (engine.currentSource() === 'mic') {
        engine.stop();
      } else {
        await engine.startMic();
      }
    } catch (err) {
      console.error('Microphone access denied or failed:', err);
      micBtn.title = 'Microphone access denied';
    }
    refresh();
  });

  // Spacebar = same action as clicking Play / Stop. Ignored when the user is
  // typing into a form field. Suppress the default scroll behavior.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    const target = e.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) return;
    e.preventDefault();
    playBtn.click();
  });

  refresh();
}

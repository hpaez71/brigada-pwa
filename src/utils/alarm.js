// Sirena sintetizada con Web Audio (no requiere archivos de audio, funciona offline).
let ctx = null;
let current = null;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Llamar en el primer gesto del usuario (iOS exige interacción para habilitar audio). */
export function unlockAudio() {
  getCtx();
}

export function playSiren(durationMs = 8000) {
  try {
    const c = getCtx();
    stopSiren();
    navigator.vibrate?.([600, 200, 600, 200, 900]);
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    gain.gain.value = 0.07;
    osc.connect(gain).connect(c.destination);
    const t0 = c.currentTime;
    const secs = durationMs / 1000;
    for (let t = 0; t < secs; t += 1) {
      osc.frequency.setValueAtTime(620, t0 + t);
      osc.frequency.linearRampToValueAtTime(1150, t0 + t + 0.5);
      osc.frequency.linearRampToValueAtTime(620, t0 + t + 1);
    }
    osc.start(t0);
    osc.stop(t0 + secs);
    current = osc;
  } catch {
    /* sin audio */
  }
}

export function stopSiren() {
  try {
    current?.stop();
  } catch {
    /* ya detenido */
  }
  current = null;
  navigator.vibrate?.(0);
}

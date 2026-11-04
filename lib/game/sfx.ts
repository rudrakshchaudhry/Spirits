"use client";
/** Tiny synthesized sound effects (no audio files). Mute is remembered per device. */
let ctx: AudioContext | null = null;
let muted: boolean | null = null;

export function isMuted() {
  if (muted === null) {
    try {
      muted = localStorage.getItem("sfs-muted") === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("sfs-muted", m ? "1" : "0");
  } catch {}
}

function tone(freq: number, at: number, dur: number, gain = 0.08, type: OscillatorType = "triangle") {
  ctx ??= new AudioContext();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + at);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + at);
  o.stop(ctx.currentTime + at + dur + 0.02);
}

export function sfx(kind: "pickup" | "befriend" | "wish") {
  if (isMuted()) return;
  try {
    if (kind === "pickup") { tone(988, 0, 0.12); tone(1319, 0.07, 0.18); }
    else if (kind === "befriend") [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35));
    else [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, i * 0.08, 0.45, 0.07, "sine"));
  } catch {}
}

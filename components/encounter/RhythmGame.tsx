"use client";
import { useEffect, useRef, useState } from "react";
import type { RhythmGame as RhythmContent } from "@/lib/encounter/games";

/**
 * "Rustle" (spec §9.1): beat notes scroll toward a hit line; tap / Space on the beat.
 * Score = hit accuracy (perfect 1, good 0.6, miss 0).
 */
const HIT_X = 64;
const PERFECT = 70; // ms
const GOOD = 160; // ms

function makeNotes(g: RhythmContent): number[] {
  const beat = 60_000 / g.bpm;
  let s = g.seed || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const out: number[] = [];
  let t = 0;
  for (let i = 0; i < g.notes; i++) {
    out.push(t);
    const r = rnd();
    // mostly on the beat; harder spirits add off-beats and rests
    t += r < g.difficulty * 0.45 ? beat / 2 : r > 0.86 ? beat * 2 : beat;
  }
  return out;
}

let audio: AudioContext | null = null;
function rustle(kind: "hit" | "miss") {
  try {
    audio ??= new AudioContext();
    const len = Math.floor(audio.sampleRate * (kind === "hit" ? 0.09 : 0.05));
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = audio.createBufferSource();
    src.buffer = buf;
    const f = audio.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = kind === "hit" ? 3200 : 600;
    const gain = audio.createGain();
    gain.gain.value = kind === "hit" ? 0.5 : 0.25;
    src.connect(f).connect(gain).connect(audio.destination);
    src.start();
  } catch {}
}

export default function RhythmGame({ game, onDone }: { game: RhythmContent; onDone: (score: number, durationMs: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState(3);
  const [stats, setStats] = useState({ perfect: 0, good: 0, miss: 0 });
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  // 3-2-1 countdown
  useEffect(() => {
    if (count <= 0) return;
    const t = setTimeout(() => setCount((c) => c - 1), 650);
    return () => clearTimeout(t);
  }, [count]);

  useEffect(() => {
    if (count > 0) return;
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const notes = makeNotes(game);
    const judged: (number | null)[] = notes.map(() => null); // quality or null
    const lead = 1400 - game.difficulty * 500; // ms a note is visible before the line
    const start = performance.now() + 600;
    const end = start + notes[notes.length - 1] + GOOD + 400;
    let flash: { text: string; at: number; good: boolean } | null = null;
    let raf = 0;
    let finished = false;

    const judge = () => {
      const now = performance.now() - start;
      let best = -1, bestDt = Infinity;
      notes.forEach((t, i) => {
        if (judged[i] !== null) return;
        const dt = Math.abs(now - t);
        if (dt < bestDt) { bestDt = dt; best = i; }
      });
      if (best < 0 || bestDt > GOOD) {
        flash = { text: "…", at: performance.now(), good: false };
        return;
      }
      const q = bestDt <= PERFECT ? 1 : 0.6;
      judged[best] = q;
      rustle("hit");
      flash = { text: q === 1 ? "Perfect" : "Good", at: performance.now(), good: true };
      setStats((s) => (q === 1 ? { ...s, perfect: s.perfect + 1 } : { ...s, good: s.good + 1 }));
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "Enter" || e.key === "j" || e.key === "f") {
        e.preventDefault();
        judge();
      }
    };
    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      judge();
    };
    window.addEventListener("keydown", onKey);
    c.addEventListener("pointerdown", onPointer);

    const W = c.width, H = c.height;
    const tick = () => {
      const now = performance.now() - start;
      // expire missed notes
      notes.forEach((t, i) => {
        if (judged[i] === null && now - t > GOOD) {
          judged[i] = 0;
          rustle("miss");
          flash = { text: "Miss", at: performance.now(), good: false };
          setStats((s) => ({ ...s, miss: s.miss + 1 }));
        }
      });
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#1d3b2a";
      ctx.fillRect(0, 0, W, H);
      // lane
      ctx.fillStyle = "#2a5238";
      ctx.fillRect(0, H / 2 - 18, W, 36);
      // hit line
      ctx.fillStyle = "#f6e7a8";
      ctx.fillRect(HIT_X - 2, H / 2 - 26, 4, 52);
      ctx.strokeStyle = "rgba(246,231,168,0.5)";
      ctx.strokeRect(HIT_X - 16, H / 2 - 16, 32, 32);
      // notes (leaves)
      const pxPerMs = (W - HIT_X) / lead;
      notes.forEach((t, i) => {
        const q = judged[i];
        if (q !== null && q > 0) return;
        const x = HIT_X + (t - now) * pxPerMs;
        if (x < -20 || x > W + 20) return;
        ctx.fillStyle = q === 0 ? "rgba(160,160,160,0.5)" : "#8fd16a";
        ctx.beginPath();
        ctx.ellipse(x, H / 2, 11, 7, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#4f8a3a";
        ctx.fillRect(x - 6, H / 2 - 1, 12, 2);
      });
      if (flash && performance.now() - flash.at < 450) {
        ctx.fillStyle = flash.good ? "#f6e7a8" : "#e9a0a0";
        ctx.font = "bold 16px var(--font-pixelify), monospace";
        ctx.fillText(flash.text, HIT_X - 20, H / 2 - 32);
      }
      // progress
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(0, H - 4, W * Math.min(1, Math.max(0, now / (end - start))), 4);

      if (performance.now() >= end && !finished) {
        finished = true;
        const score = judged.reduce<number>((a, q) => a + (q ?? 0), 0) / notes.length;
        doneRef.current(score, Math.round(performance.now() - start + 600));
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      c.removeEventListener("pointerdown", onPointer);
    };
  }, [count, game]);

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-center text-sm text-slate-300">{game.flavor}</p>
      <div className="relative w-full">
        <canvas ref={canvas} width={520} height={120} className="w-full touch-none rounded-md" style={{ imageRendering: "pixelated" }} />
        {count > 0 && (
          <div className="absolute inset-0 grid place-items-center rounded-md bg-black/40 font-pixel text-4xl text-amber-100">{count}</div>
        )}
      </div>
      <p className="text-xs text-slate-400">
        Tap the lane or press <kbd className="rounded bg-white/10 px-1">Space</kbd> as each leaf reaches the line · {game.bpm} bpm
      </p>
      <p className="font-mono text-xs text-slate-300">
        perfect {stats.perfect} · good {stats.good} · miss {stats.miss}
      </p>
    </div>
  );
}

"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MosaicGame as MosaicContent } from "@/lib/encounter/games";

/**
 * "Mosaic" (spec §9.5): the guardian's pattern is scrambled into rotated tiles.
 * Tap a tile to turn it 90°. Restore the pattern before time runs out to hear
 * the artwork's real story. Shapes (not just colours) carry the pattern, so it
 * works for colour-blind players.
 */
const TILE = 64;

function rng(seed: number) {
  let s = seed || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function drawPattern(ctx: CanvasRenderingContext2D, size: number, seed: number, hue: number) {
  const W = size * TILE;
  const r = rng(seed);
  const hsl = (h: number, s: number, l: number) => `hsl(${(h + 360) % 360} ${s}% ${l}%)`;
  ctx.fillStyle = hsl(hue, 45, 22);
  ctx.fillRect(0, 0, W, W);
  // diagonal bands
  for (let i = -W; i < W * 2; i += TILE * 0.9) {
    ctx.fillStyle = hsl(hue + 30, 55, 32 + (i % 3) * 4);
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + TILE * 0.35, 0);
    ctx.lineTo(i + TILE * 0.35 - W, W);
    ctx.lineTo(i - W, W);
    ctx.fill();
  }
  // off-centre rings
  const cx = W * (0.3 + r() * 0.4), cy = W * (0.3 + r() * 0.4);
  for (let k = 5; k > 0; k--) {
    ctx.fillStyle = hsl(hue + 150 + k * 18, 70, 40 + k * 7);
    ctx.beginPath();
    ctx.arc(cx, cy, (W * 0.12) * k * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  // triangles + dots
  for (let i = 0; i < size * 2; i++) {
    const x = r() * W, y = r() * W, s = TILE * (0.3 + r() * 0.4);
    ctx.fillStyle = hsl(hue + 60 + i * 25, 75, 62);
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y + s * 0.6);
    ctx.lineTo(x - s * 0.4, y + s * 0.2);
    ctx.fill();
  }
  for (let i = 0; i < size * 6; i++) {
    ctx.fillStyle = hsl(hue + 200, 30, 90);
    ctx.fillRect(Math.floor(r() * W), Math.floor(r() * W), 4, 4);
  }
}

export default function MosaicGame({ game, onDone }: { game: MosaicContent; onDone: (score: number, durationMs: number) => void }) {
  const N = game.size;
  const source = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = c.height = N * TILE;
    drawPattern(c.getContext("2d")!, N, game.seed, game.hue);
    return c;
  }, [N, game.seed, game.hue]);
  const [rot, setRot] = useState<number[]>(() => {
    const r = rng(game.seed ^ 0x9e3779b9);
    return Array.from({ length: N * N }, () => 1 + Math.floor(r() * 3)); // never pre-solved
  });
  const [left, setLeft] = useState(game.seconds);
  const [done, setDone] = useState(false);
  const board = useRef<HTMLCanvasElement>(null);
  const start = useRef(0);
  useEffect(() => {
    start.current = performance.now();
  }, []);

  const solvedCount = rot.filter((x) => x % 4 === 0).length;

  // draw board
  useEffect(() => {
    const ctx = board.current?.getContext("2d");
    if (!ctx || !source) return;
    ctx.clearRect(0, 0, N * TILE, N * TILE);
    for (let i = 0; i < N * N; i++) {
      const tx = (i % N) * TILE, ty = Math.floor(i / N) * TILE;
      ctx.save();
      ctx.translate(tx + TILE / 2, ty + TILE / 2);
      ctx.rotate((rot[i] * Math.PI) / 2);
      ctx.drawImage(source, tx, ty, TILE, TILE, -TILE / 2, -TILE / 2, TILE, TILE);
      ctx.restore();
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.strokeRect(tx + 0.5, ty + 0.5, TILE - 1, TILE - 1);
    }
  }, [rot, source, N]);

  // finish
  useEffect(() => {
    if (done) return;
    const solved = solvedCount === N * N;
    if (!solved && left > 0) return;
    const t = setTimeout(() => {
      setDone(true);
      const elapsed = performance.now() - start.current;
      const score = solved ? Math.max(0.7, 1 - (elapsed / 1000 / game.seconds) * 0.3) : (solvedCount / (N * N)) * 0.6;
      onDone(score, Math.round(elapsed));
    }, solved ? 900 : 0);
    return () => clearTimeout(t);
  }, [solvedCount, left, done, N, game.seconds, onDone]);

  useEffect(() => {
    if (done || left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, done]);

  const turn = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (done) return;
    const b = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - b.left) / b.width) * N);
    const y = Math.floor(((e.clientY - b.top) / b.height) * N);
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    setRot((r) => r.map((v, i) => (i === y * N + x ? (v + 1) % 4 : v)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Tap a tile to turn it. Restore the guardian’s pattern.</span>
        <span className={`font-mono ${left <= 10 ? "text-rose-300" : ""}`}>{left}s</span>
      </div>
      <div className="flex items-start gap-3">
        <canvas
          ref={board}
          width={N * TILE}
          height={N * TILE}
          onPointerDown={turn}
          className="w-full max-w-[280px] cursor-pointer touch-none rounded-md"
          aria-label={`Mosaic puzzle, ${solvedCount} of ${N * N} tiles in place`}
        />
        <div className="space-y-1 text-xs text-slate-400">
          <p>Target</p>
          {source && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={source.toDataURL()} alt="" className="w-20 rounded opacity-90" />
          )}
          <p className="font-mono">
            {solvedCount}/{N * N} in place
          </p>
        </div>
      </div>
      {done && solvedCount === N * N && (
        <p className="rounded-md bg-fuchsia-500/15 px-3 py-2 text-sm text-fuchsia-100">
          The mosaic glows: “{game.reveal.title}”{game.reveal.artist ? ` by ${game.reveal.artist}` : ""}
          {game.reveal.year ? ` (${game.reveal.year})` : ""}
          {game.reveal.medium ? ` · ${game.reveal.medium}` : ""}
        </p>
      )}
    </div>
  );
}

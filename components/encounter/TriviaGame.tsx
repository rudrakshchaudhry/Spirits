"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TriviaGame as TriviaContent } from "@/lib/encounter/games";

/** "Take Two" (spec §9.4): rapid film trivia built only from the film's dataset row. */
export default function TriviaGame({ game, onDone }: { game: TriviaContent; onDone: (score: number, durationMs: number) => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [left, setLeft] = useState(game.seconds);
  const correct = useRef(0);
  const start = useRef(0);
  useEffect(() => {
    start.current = performance.now();
  }, []);
  const q = game.questions[i];

  const choose = useCallback(
    (idx: number) => {
      if (picked !== null) return;
      setPicked(idx);
      if (idx === q.answer) correct.current++;
      setTimeout(() => {
        if (i + 1 >= game.questions.length) onDone(correct.current / game.questions.length, Math.round(performance.now() - start.current));
        else {
          setI(i + 1);
          setPicked(null);
          setLeft(game.seconds);
        }
      }, 750);
    },
    [picked, q, i, game, onDone],
  );

  useEffect(() => {
    if (picked !== null) return;
    if (left <= 0) {
      const t = setTimeout(() => choose(-1), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, picked, choose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) choose(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, choose]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Question {i + 1} / {game.questions.length}
        </span>
        <span className={left <= 2 ? "text-rose-300" : ""}>{left}s</span>
      </div>
      <p className="font-pixel text-lg leading-snug text-slate-50">{q.q}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {q.options.map((o, idx) => {
          const state = picked === null ? "" : idx === q.answer ? "border-emerald-400 bg-emerald-500/20" : idx === picked ? "border-rose-400 bg-rose-500/20" : "opacity-60";
          return (
            <button
              key={idx}
              type="button"
              onClick={() => choose(idx)}
              className={`rounded-md border border-white/15 bg-white/5 px-3 py-2 text-left text-sm text-slate-100 transition-colors hover:bg-white/10 ${state}`}
            >
              <span className="mr-2 font-mono text-xs text-slate-400">{idx + 1}</span>
              {o}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">Answers come straight from the city’s film-location records.</p>
    </div>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { bus } from "@/lib/game/bus";
import { accessToken, api } from "@/lib/game/api";
import { useGame } from "@/lib/game/store";
import type { GiftResponse, PlayResponse, StartResponse } from "@/lib/encounter/types";
import { FAMILY_LABEL, RARITY_STYLE } from "@/lib/spirits/labels";
import GiftPanel from "./GiftPanel";
import MosaicGame from "./MosaicGame";
import RhythmGame from "./RhythmGame";
import RushGame from "./RushGame";
import SpiritPortrait from "./SpiritPortrait";
import TriviaGame from "./TriviaGame";

type Phase = "loading" | "meet" | "play" | "saving" | "result" | "friend" | "wandering" | "error";

function TrustMeter({ value, from }: { value: number; from?: number }) {
  const pct = Math.min(100, value);
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-slate-400">
        <span>Trust</span>
        <span className="font-mono">{Math.min(value, 100)} / 100</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-white/10">
        {from !== undefined && <div className="absolute inset-y-0 left-0 bg-amber-200/30" style={{ width: `${Math.min(100, from)}%` }} />}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-out motion-reduce:transition-none ${pct >= 100 ? "bg-rose-400" : "bg-amber-300"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const minutesUntil = (iso: string) => Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 60_000));

/** Meet → play → result (spec §8.1). Gifts arrive with keepsakes (roadmap). */
export default function EncounterDialog() {
  const ref = useGame((s) => s.encounter);
  const dev = useGame((s) => s.devMode);
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<StartResponse | null>(null);
  const [greeting, setGreeting] = useState("");
  const [result, setResult] = useState<PlayResponse | null>(null);
  const [shownTrust, setShownTrust] = useState(0);
  const [error, setError] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [gift, setGift] = useState<GiftResponse | null>(null);
  const abort = useRef<AbortController | null>(null);

  const close = useCallback(() => {
    abort.current?.abort();
    // clear `nearby` too: Phaser handles the same Space/Enter keypress next frame and would reopen
    useGame.setState({ encounter: null, nearby: null });
  }, []);

  // start encounter
  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    const ac = new AbortController();
    abort.current = ac;
    (async () => {
      setPhase("loading");
      setData(null);
      setResult(null);
      setGreeting("");
      setGiftOpen(false);
      setGift(null);
      try {
        const res = await api<StartResponse>("/api/encounter/start", { method: "POST", body: JSON.stringify({ placeId: ref.placeId }), signal: ac.signal });
        if (cancelled) return;
        setData(res);
        setShownTrust(res.trust);
        if (res.mode === "friend") {
          setGreeting(res.greeting);
          setPhase("friend");
          return;
        }
        if (res.mode === "wandering") {
          setPhase("wandering");
          return;
        }
        setPhase("meet");
        // live greeting stream (mistral-small; server falls back to the cached line after 2.5 s)
        await accessToken();
        const g = await fetch(`/api/encounter/greet?token=${encodeURIComponent(res.token)}`, { signal: ac.signal });
        if (!g.ok || !g.body) {
          setGreeting(res.greeting);
          return;
        }
        const reader = g.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done || cancelled) break;
          setGreeting((s) => s + dec.decode(value, { stream: true }));
        }
      } catch (e) {
        if (cancelled || (e as Error).name === "AbortError") return;
        setError((e as Error).message);
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [ref]);

  const finishGame = useCallback(
    async (score: number, durationMs: number) => {
      if (!data || data.mode !== "meet") return;
      setPhase("saving");
      try {
        const r = await api<PlayResponse>("/api/encounter/play", {
          method: "POST",
          body: JSON.stringify({ token: data.token, score, durationMs, demo: dev }),
        });
        setResult(r);
        setPhase("result");
        requestAnimationFrame(() => setShownTrust(r.trust));
        if (r.befriended) {
          useGame.setState((s) => ({ friends: { ...s.friends, [data.spirit.id]: true } }));
          bus.emit("spirit:befriended", { spiritId: data.spirit.id });
        }
      } catch (e) {
        setError((e as Error).message);
        setPhase("error");
      }
    },
    [data, dev],
  );

  const onGift = useCallback(
    (g: GiftResponse) => {
      setGift(g);
      setGiftOpen(false);
      if (g.outcome === "declined" || !data) return;
      setShownTrust(g.trust);
      if (g.befriended) {
        useGame.setState((s) => ({ friends: { ...s.friends, [data.spirit.id]: true } }));
        bus.emit("spirit:befriended", { spiritId: data.spirit.id });
      }
    },
    [data],
  );

  // keyboard: Esc closes, Space/Enter advances from meet/result
  useEffect(() => {
    if (!ref) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "play") close();
      if ((e.code === "Space" || e.code === "Enter") && !e.repeat && !giftOpen) {
        if (phase === "meet") {
          e.preventDefault();
          setPhase("play");
        } else if (phase === "result" || phase === "friend" || phase === "wandering" || phase === "error") {
          e.preventDefault();
          close();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref, phase, close, giftOpen]);

  if (!ref) return null;
  const sp = data?.spirit;
  const family = sp?.family ?? ref.family;
  const rarity = sp?.rarity ?? ref.rarity;

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-slate-950/55 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Spirit encounter">
      <div className="w-full max-w-xl rounded-xl border border-white/10 bg-slate-900/95 p-4 text-slate-100 shadow-2xl sm:p-5">
        {/* header */}
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-white/5 p-1">
            <SpiritPortrait family={family} rarity={rarity} seed={sp?.seed ?? ref.seed} look={sp?.look ?? ref.look} size={84} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-pixel text-2xl leading-none">{sp?.name ?? "…"}</h2>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${RARITY_STYLE[rarity]}`}>{rarity}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {FAMILY_LABEL[family] ?? family}
              {data?.place && (
                <>
                  {" "}of{" "}
                  <span className="text-slate-200">
                    {/* don't give away the trivia answer: hide "(1984)" while playing */}
                    {data.place.kind === "film" && phase === "play" ? data.place.name.replace(/\s*\(\d{4}\)$/, "") : data.place.name}
                  </span>
                  {data.place.neighborhood && <> · {data.place.neighborhood}</>}
                </>
              )}
            </p>
            {sp && <p className="mt-2 line-clamp-3 text-sm text-slate-300">{sp.persona}</p>}
          </div>
          <button type="button" onClick={close} className="rounded px-2 py-1 text-sm text-slate-400 hover:bg-white/10" aria-label="Leave">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {phase === "loading" && <p className="font-pixel animate-pulse text-slate-300 motion-reduce:animate-none">The spirit notices you…</p>}

          {(phase === "meet" || phase === "friend") && (
            <blockquote className="min-h-12 rounded-md bg-white/5 px-3 py-2 text-[15px] leading-relaxed text-slate-100">
              {greeting || <span className="animate-pulse text-slate-400 motion-reduce:animate-none">…</span>}
            </blockquote>
          )}

          {phase === "meet" && data?.mode === "meet" && (
            <>
              <div className="rounded-md border border-amber-200/20 bg-amber-100/5 px-3 py-2 text-sm italic text-amber-100">
                <span className="mr-1 not-italic">✦</span>
                {data.riddle}
              </div>
              <TrustMeter value={shownTrust} />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-400">Play to earn trust. Reach 100 to become friends.</p>
                <button type="button" onClick={() => setPhase("play")} className="rounded-md bg-amber-300 px-4 py-2 font-pixel text-slate-900 hover:bg-amber-200">
                  Play {data.game.title}
                </button>
              </div>
            </>
          )}

          {phase === "play" && data?.mode === "meet" &&
            (() => {
              const g = data.game;
              switch (g.type) {
                case "rhythm": return <RhythmGame game={g} onDone={finishGame} />;
                case "trivia": return <TriviaGame game={g} onDone={finishGame} />;
                case "rush": return <RushGame game={g} onDone={finishGame} />;
                case "mosaic": return <MosaicGame game={g} onDone={finishGame} />;
                case "thennow":
                  return (
                    <TriviaGame
                      game={{ seconds: g.seconds, questions: g.rounds.map((r) => ({ q: `Then: ${r.clue} What stands here now?`, options: r.options, answer: r.answer })) }}
                      onDone={finishGame}
                      footer="Clues come from SF Planning landmark records and the city's datasets; every answer is a real place within 300 m."
                    />
                  );
              }
            })()}

          {phase === "saving" && <p className="font-pixel animate-pulse text-slate-300 motion-reduce:animate-none">The spirit thinks it over…</p>}

          {phase === "result" && result && data && (
            <>
              <TrustMeter value={shownTrust} from={data.trust} />
              {result.befriended || (gift && gift.outcome !== "declined" && gift.befriended) ? (
                <div className="space-y-2">
                  <p className="font-pixel text-xl text-rose-200">
                    {gift?.rare ? "✦" : "♥"} {data.spirit.name} is now your {gift?.rare ? "rare " : ""}friend!
                  </p>
                  {result.lore && <p className="rounded-md bg-white/5 px-3 py-2 text-sm text-slate-200">{result.lore}</p>}
                  <p className="text-xs text-slate-400">Saved to your Spirit Atlas (B).</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="font-pixel text-lg text-slate-200">{data.spirit.name} drifts away for now…</p>
                  <p className="text-sm text-slate-400">
                    +{result.gained} trust, and it’s kept. Come back in {result.wanderedUntil ? minutesUntil(result.wanderedUntil) : 10} min
                    {dev ? " (demo: 20 s)" : ""} to try again.
                  </p>
                </div>
              )}
              <div className="flex justify-end">
                <button type="button" onClick={close} className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/15">
                  Continue
                </button>
              </div>
            </>
          )}

          {phase === "friend" && data?.mode === "friend" && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-rose-200">♥ friend · lore {data.lore.length}/3</p>
              {data.lore.map((l, i) => (
                <p key={i} className="rounded-md bg-white/5 px-3 py-2 text-sm text-slate-200">
                  {l}
                </p>
              ))}
            </div>
          )}


          {(phase === "result" || phase === "friend") && data && data.mode !== "wandering" && (
            <div className="space-y-2">
              {gift && (
                <div className={`rounded-md px-3 py-2 text-sm ${gift.outcome === "wish" ? "bg-fuchsia-500/15 text-fuchsia-100" : gift.outcome === "theme" ? "bg-amber-500/10 text-amber-100" : "bg-white/5 text-slate-300"}`}>
                  <p>{gift.line}</p>
                  {gift.outcome !== "declined" && <p className="mt-1 text-xs opacity-80">Trust {Math.min(100, gift.trust)} / 100{gift.rare ? " · rare friendship ✦" : gift.befriended ? " · friends ♥" : ""}</p>}
                  {gift.secret && <p className="mt-2 border-t border-white/10 pt-2 italic">✦ {gift.secret}</p>}
                </div>
              )}
              {giftOpen ? (
                <GiftPanel token={data.token} onResult={onGift} onCancel={() => setGiftOpen(false)} />
              ) : (
                (() => {
                  const canGift =
                    (phase === "result" && !result?.befriended && !(gift && gift.outcome !== "declined" && gift.befriended)) ||
                    (phase === "friend" && data.mode === "friend" && !data.wishGranted && gift?.outcome !== "wish");
                  return canGift ? (
                    <button type="button" onClick={() => setGiftOpen(true)} className="rounded-md border border-amber-200/30 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-100/10">
                      Offer a keepsake…
                    </button>
                  ) : null;
                })()
              )}
            </div>
          )}

          {phase === "wandering" && data?.mode === "wandering" && (
            <p className="text-sm text-slate-300">
              {data.spirit.name} is off wandering. Back in about {minutesUntil(data.until)} min. Your trust ({data.trust}) is safe.
            </p>
          )}

          {phase === "error" && <p className="text-sm text-rose-300">{error || "Something went quiet."}</p>}
        </div>
      </div>
    </div>
  );
}

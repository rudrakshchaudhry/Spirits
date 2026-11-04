"use client";
import { useEffect, useState } from "react";
import SpiritPortrait from "@/components/encounter/SpiritPortrait";
import KeepsakeIcon from "@/components/KeepsakeIcon";
import { keepsake } from "@/lib/keepsakes/catalog";
import AtlasMap from "./AtlasMap";
import { api } from "@/lib/game/api";
import { useGame } from "@/lib/game/store";
import { FAMILY_LABEL, RARITY_STYLE } from "@/lib/spirits/labels";

type Entry = {
  spirit_id: string;
  family: string;
  rarity: string;
  spirit_name: string;
  place_name: string;
  neighborhood: string | null;
  trust: number;
  status: string;
  look: string | null;
  sprite_seed: number;
  lore: string[];
  wish: { theme: string; keepsake: string; riddles: string[]; glowHoods: string[]; granted: boolean } | null;
};
type AtlasData = {
  friends: Entry[];
  met: Entry[];
  inventory: Record<string, number>;
  explored: Record<string, number>;
  stats: { friends: number; met: number; neighborhoods: number; explored: number; keepsakes: number };
};

const TABS = ["Friends", "Met", "Wishes", "Keepsakes", "Map"] as const;

/** Spirit Atlas (spec §13.4). Never shows exact positions of undiscovered spirits. */
export default function Atlas() {
  const open = useGame((s) => s.atlasOpen);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Friends");
  const [data, setData] = useState<AtlasData | null>(null);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    api<AtlasData>("/api/atlas").then(
      (d) => live && setData(d),
      (e) => live && setErr((e as Error).message),
    );
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && useGame.setState({ atlasOpen: false });
    window.addEventListener("keydown", onKey);
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => useGame.setState((s) => ({ atlasOpen: !s.atlasOpen }))}
        className="absolute left-3 top-3 rounded-lg border border-slate-900/60 bg-slate-950/70 px-3 py-1.5 font-pixel text-sm text-amber-100 shadow-lg hover:bg-slate-900"
      >
        Atlas <span className="ml-1 hidden font-mono text-[10px] text-slate-400 sm:inline">B</span>
      </button>
      {open && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 p-3" onClick={() => useGame.setState({ atlasOpen: false })}>
          <div className="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-slate-900/95 text-slate-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <h2 className="font-pixel text-2xl">Spirit Atlas</h2>
                {data && (
                  <p className="text-xs text-slate-400">
                    {data.stats.friends} friends · {data.stats.met} met · {data.stats.explored} neighborhoods explored · {data.stats.keepsakes} keepsakes
                  </p>
                )}
              </div>
              <button type="button" onClick={() => useGame.setState({ atlasOpen: false })} className="rounded px-2 py-1 text-sm text-slate-400 hover:bg-white/10">
                Close
              </button>
            </div>
            <div className="flex flex-wrap gap-1 px-4 pt-3">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1 text-sm ${tab === t ? "bg-white/15 text-white" : "text-slate-400 hover:bg-white/5"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="min-h-48 overflow-y-auto p-4">
              {err && <p className="text-sm text-rose-300">{err}</p>}
              {!data && !err && <p className="font-pixel animate-pulse text-slate-400 motion-reduce:animate-none">Opening the Atlas…</p>}
              {data && (tab === "Friends" || tab === "Met") && (
                <List
                  entries={tab === "Friends" ? data.friends : data.met}
                  empty={tab === "Friends" ? "No friends yet. Walk up to a spirit and press E." : "Spirits you’ve met but not befriended appear here."}
                  expanded={expanded}
                  onToggle={(id) => setExpanded((x) => (x === id ? null : id))}
                />
              )}
              {data && tab === "Wishes" && <Wishes entries={[...data.met, ...data.friends].filter((e) => e.wish?.riddles.length)} />}
              {data && tab === "Keepsakes" && <Keepsakes items={data.inventory} />}
              {data && tab === "Map" && (
                <AtlasMap
                  explored={data.explored}
                  glow={[...new Set([...data.met, ...data.friends].flatMap((e) => e.wish?.glowHoods ?? []))]}
                  featured={useGame.getState().conditions?.featured?.neighborhood ?? null}
                  haze={useGame.getState().conditions?.haze}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function List({ entries, empty, expanded, onToggle }: { entries: Entry[]; empty: string; expanded: string | null; onToggle: (id: string) => void }) {
  if (!entries.length) return <p className="text-sm text-slate-400">{empty}</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {entries.map((e) => (
        <li key={e.spirit_id}>
          <button type="button" onClick={() => onToggle(e.spirit_id)} className="flex w-full items-start gap-3 rounded-lg bg-white/5 p-2 text-left hover:bg-white/10">
            <SpiritPortrait family={e.family} rarity={e.rarity} seed={e.sprite_seed} look={e.look} size={56} animate={false} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-pixel text-lg leading-none">{e.spirit_name}</span>
                <span className={`rounded px-1 text-[9px] font-semibold uppercase ${RARITY_STYLE[e.rarity]}`}>{e.rarity}</span>
                {e.status === "rare" && <span className="text-[10px] text-fuchsia-200">✦ rare friend</span>}
              </div>
              <p className="truncate text-xs text-slate-400">
                {FAMILY_LABEL[e.family]} · {e.place_name}
              </p>
              <p className="text-xs text-slate-500">
                {e.neighborhood ?? "San Francisco"} · trust {Math.min(100, e.trust)}
              </p>
              {expanded === e.spirit_id &&
                (e.lore.length ? (
                  e.lore.map((l, i) => (
                    <p key={i} className="mt-2 text-xs text-slate-300">
                      {l}
                    </p>
                  ))
                ) : (
                  <p className="mt-2 text-xs text-slate-500">Befriend to hear its story.</p>
                ))}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Wishes({ entries }: { entries: Entry[] }) {
  if (!entries.length) return <p className="text-sm text-slate-400">Every spirit has a wish. Meet one to hear its first riddle.</p>;
  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <li key={e.spirit_id} className="rounded-lg bg-white/5 p-3">
          <p className="font-pixel">
            {e.spirit_name} <span className="text-xs text-slate-400">wishes for {e.wish!.theme}</span>
          </p>
          {e.wish!.riddles.map((r, i) => (
            <p key={i} className="mt-1 text-sm italic text-amber-100">
              ✦ {r}
            </p>
          ))}
          {e.wish!.granted ? (
            <p className="mt-2 text-xs text-fuchsia-200">✦ Wish granted</p>
          ) : e.wish!.glowHoods.length > 0 ? (
            <p className="mt-2 text-xs text-emerald-200">Your Atlas glows toward: {e.wish!.glowHoods.join(", ")}</p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Hear its second riddle and the Atlas will glow toward where to look.</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Keepsakes({ items }: { items: Record<string, number> }) {
  const entries = Object.entries(items).sort((a, b) => keepsake(a[0]).theme.localeCompare(keepsake(b[0]).theme));
  if (!entries.length) return <p className="text-sm text-slate-400">No keepsakes yet. Walk over the little glints you see on the ground.</p>;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {entries.map(([type, qty]) => (
        <li key={type} className="flex items-center gap-2 rounded-lg bg-white/5 p-2">
          <KeepsakeIcon type={type} size={28} />
          <div className="min-w-0">
            <p className="truncate text-sm text-slate-100">{keepsake(type).label}</p>
            <p className="text-xs text-slate-400">
              {keepsake(type).theme} · ×{qty}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

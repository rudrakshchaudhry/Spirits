"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import KeepsakeIcon from "@/components/KeepsakeIcon";
import RhythmGame from "@/components/encounter/RhythmGame";
import SpiritPortrait from "@/components/encounter/SpiritPortrait";
import { COMPANION_PX, drawCompanion } from "@/game/companionArt";
import { api, supabase } from "@/lib/game/api";
import { useGame } from "@/lib/game/store";
import type { RhythmGame as RhythmContent } from "@/lib/encounter/games";
import { KEEPSAKES, keepsake } from "@/lib/keepsakes/catalog";
import { COMPANIONS } from "@/lib/social/rules";
import { refreshMe } from "./MeSync";

const TABS = ["Crew", "Trades", "Gatherings", "Me"] as const;
type Tab = (typeof TABS)[number];
const stop = (e: React.KeyboardEvent) => e.stopPropagation(); // keep typing out of the game

/** Town (T): crew board, trading, gatherings, profile (spec §14). */
export default function TownPanel() {
  const open = useGame((s) => s.townOpen);
  const me = useGame((s) => s.me);
  const [tab, setTab] = useState<Tab>("Crew");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && useGame.setState({ townOpen: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const close = () => useGame.setState({ townOpen: false });
  const locked: Partial<Record<Tab, string | null>> = {
    Crew: me && !me.unlocks.crew ? "Explore 2 neighborhoods to unlock the crew board." : null,
    Trades: me && !me.unlocks.trading ? "Befriend 5 spirits to unlock trading." : null,
    Gatherings: me && !me.unlocks.gatherings ? "Befriend 10 spirits to unlock gatherings." : null,
  };
  return (
    <>
      <button
        type="button"
        onClick={() => useGame.setState((s) => ({ townOpen: !s.townOpen }))}
        className="absolute left-[5.5rem] top-3 rounded-lg border border-slate-900/60 bg-slate-950/70 px-3 py-1.5 font-pixel text-sm text-sky-100 shadow-lg hover:bg-slate-900"
      >
        Town <span className="ml-1 hidden font-mono text-[10px] text-slate-400 sm:inline">T</span>
      </button>
      {open && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 p-3" onClick={close}>
          <div className="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-slate-900/95 text-slate-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="font-pixel text-2xl">Town</h2>
              <button type="button" onClick={close} className="rounded px-2 py-1 text-sm text-slate-400 hover:bg-white/10">Close</button>
            </div>
            <div className="flex flex-wrap gap-1 px-4 pt-3">
              {TABS.map((t) => (
                <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md px-3 py-1 text-sm ${tab === t ? "bg-white/15 text-white" : "text-slate-400 hover:bg-white/5"}`}>
                  {t}
                  {locked[t] && <span className="ml-1 text-[10px]">🔒</span>}
                </button>
              ))}
            </div>
            <div className="min-h-56 overflow-y-auto p-4">
              {locked[tab] ? (
                <p className="text-sm text-slate-400">{locked[tab]}</p>
              ) : tab === "Crew" ? (
                <CrewTab />
              ) : tab === "Trades" ? (
                <TradesTab />
              ) : tab === "Gatherings" ? (
                <GatheringsTab />
              ) : (
                <MeTab />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ───────────────────────── Crew board ─────────────────────────
type Board = {
  weekStart: string;
  top: { hood: string; members: number; chunks: number; friends: number; wishes: number; score: number }[];
  mine: { hood: string; rank: number | null } | null;
  contribution: { chunks: number; friends: number; wishes: number; points: number };
};
function CrewTab() {
  const [b, setB] = useState<Board | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Board>("/api/crews/board").then(setB, (e) => setErr((e as Error).message));
  }, []);
  if (err) return <p className="text-sm text-rose-300">{err}</p>;
  if (!b) return <p className="animate-pulse text-sm text-slate-400 motion-reduce:animate-none">Tallying the week…</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        This week (since Monday): new ground explored + friends made ×5 + wishes granted ×10, divided by active members so small crews can win.
      </p>
      <ol className="space-y-1">
        {b.top.map((r, i) => (
          <li key={r.hood} className={`flex items-center justify-between rounded px-2 py-1 text-sm ${r.hood === b.mine?.hood ? "bg-amber-300/15 text-amber-100" : "bg-white/5"}`}>
            <span><span className="mr-2 font-mono text-slate-400">{i + 1}</span>{r.hood}</span>
            <span className="font-mono text-xs text-slate-300">{r.score} · {r.members} active</span>
          </li>
        ))}
        {!b.top.length && <li className="text-sm text-slate-400">No crew has scored yet this week — go be first.</li>}
      </ol>
      {b.mine && (
        <p className="text-sm text-slate-300">
          Your crew, <span className="text-amber-200">{b.mine.hood}</span>, is {b.mine.rank ? `#${b.mine.rank}` : "unranked"}. You added {b.contribution.points} points
          ({b.contribution.chunks} new chunks, {b.contribution.friends} friends, {b.contribution.wishes} wishes).
        </p>
      )}
    </div>
  );
}

// ───────────────────────── Trades ─────────────────────────
type Trade = { id: string; with: string; offer: Record<string, number>; request: Record<string, number>; status: string; created_at: string };
function Bag({ bag }: { bag: Record<string, number> }) {
  const e = Object.entries(bag);
  if (!e.length) return <span className="text-slate-500">nothing</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {e.map(([k, n]) => (
        <span key={k} className="inline-flex items-center gap-1 rounded bg-white/5 px-1">
          <KeepsakeIcon type={k} size={14} />
          {keepsake(k).label} ×{n}
        </span>
      ))}
    </span>
  );
}
function BagPicker({ label, value, onChange, max }: { label: string; value: Record<string, number>; onChange: (v: Record<string, number>) => void; max?: Record<string, number> }) {
  const [pick, setPick] = useState("");
  const options = max ? Object.keys(max) : Object.keys(KEEPSAKES);
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-400">{label}</p>
      <div className="flex gap-1">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-0 flex-1 rounded bg-slate-950 px-1 py-1 text-xs">
          <option value="">choose…</option>
          {options.map((k) => (
            <option key={k} value={k}>{keepsake(k).label}{max ? ` (have ${max[k]})` : ""}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!pick}
          onClick={() => onChange({ ...value, [pick]: Math.min(5, max?.[pick] ?? 5, (value[pick] ?? 0) + 1) })}
          className="rounded bg-white/10 px-2 text-xs disabled:opacity-40"
        >
          + add
        </button>
      </div>
      <div className="text-xs"><Bag bag={value} /> {Object.keys(value).length > 0 && <button type="button" onClick={() => onChange({})} className="ml-1 text-slate-400 underline">clear</button>}</div>
    </div>
  );
}
function TradesTab() {
  const [data, setData] = useState<{ incoming: Trade[]; outgoing: Trade[]; limits: { perDay: number; usedToday: number } } | null>(null);
  const [inv, setInv] = useState<Record<string, number>>({});
  const [to, setTo] = useState("");
  const [offer, setOffer] = useState<Record<string, number>>({});
  const [request, setRequest] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    api<typeof data>("/api/trades").then(setData, (e) => setMsg((e as Error).message));
    api<{ items: Record<string, number> }>("/api/inventory").then((r) => setInv(r.items), () => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const act = (id: string, action: string) =>
    api(`/api/trades/${id}`, { method: "POST", body: JSON.stringify({ action }) }).then(() => { setMsg(`Trade ${action === "accept" ? "accepted" : action + "ed"}.`); load(); }, (e) => setMsg((e as Error).message));
  const propose = () =>
    api("/api/trades", { method: "POST", body: JSON.stringify({ to, offer, request }) }).then(
      () => { setMsg("Trade sent!"); setOffer({}); setRequest({}); load(); },
      (e) => setMsg((e as Error).message),
    );
  if (!data) return <p className="animate-pulse text-sm text-slate-400 motion-reduce:animate-none">Opening the market…</p>;
  return (
    <div className="space-y-4">
      {msg && <p className="text-sm text-amber-100">{msg}</p>}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Offers for you</h3>
        {!data.incoming.length && <p className="text-xs text-slate-500">Nothing yet.</p>}
        {data.incoming.map((t) => (
          <div key={t.id} className="space-y-1 rounded-lg bg-white/5 p-2 text-xs">
            <p><span className="text-sky-200">{t.with}</span> offers <Bag bag={t.offer} /> for <Bag bag={t.request} /></p>
            <div className="flex gap-1">
              <button type="button" onClick={() => act(t.id, "accept")} className="rounded bg-emerald-400/80 px-2 py-0.5 text-slate-900">Accept</button>
              <button type="button" onClick={() => act(t.id, "decline")} className="rounded bg-white/10 px-2 py-0.5">Decline</button>
            </div>
          </div>
        ))}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Propose a trade</h3>
        <input value={to} onChange={(e) => setTo(e.target.value.toLowerCase())} onKeyDown={stop} placeholder="their name" className="w-full rounded bg-slate-950 px-2 py-1 text-sm" />
        <div className="grid gap-2 sm:grid-cols-2">
          <BagPicker label="You give" value={offer} onChange={setOffer} max={inv} />
          <BagPicker label="You ask for" value={request} onChange={setRequest} />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-500">Keepsakes only · max 5 of one kind · {data.limits.usedToday}/{data.limits.perDay} trades today</p>
          <button type="button" disabled={!to || (!Object.keys(offer).length && !Object.keys(request).length)} onClick={propose} className="rounded bg-amber-300 px-3 py-1 text-sm text-slate-900 disabled:opacity-40">Send</button>
        </div>
      </section>
      <section className="space-y-1">
        <h3 className="text-sm font-semibold">Your recent offers</h3>
        {data.outgoing.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1 text-xs">
            <span>to <span className="text-sky-200">{t.with}</span>: <Bag bag={t.offer} /> → <Bag bag={t.request} /></span>
            {t.status === "pending" ? <button type="button" onClick={() => act(t.id, "cancel")} className="text-slate-400 underline">cancel</button> : <span className="text-slate-500">{t.status}</span>}
          </div>
        ))}
      </section>
    </div>
  );
}

// ───────────────────────── Gatherings ─────────────────────────
type G = { id: string; name: string; neighborhood: string; ends_at: string; min_players: number; checkedIn: number; me: boolean };
type Room = {
  event: { id: string; name: string; neighborhood: string; min_players: number };
  spirit: { name: string; family: string; rarity: string; look: string | null; seed: number; persona: string } | null;
  roster: { handle: string; demo: boolean }[];
  checkedIn: boolean;
  played: number;
  youPlayed: boolean;
  teamScore: number | null;
  result: "pending" | "success" | "failed";
  game: RhythmContent;
};
function GatheringsTab() {
  const [list, setList] = useState<{ gatherings: G[]; demo: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [room, setRoom] = useState<string | null>(null);
  const allowDemo = useGame((s) => !!s.conditions?.devAllowed);
  useEffect(() => {
    api<{ gatherings: G[]; demo: boolean }>("/api/gatherings/active").then(setList, (e) => setErr((e as Error).message));
  }, [room]);
  if (room) return <GatheringRoom id={room} onBack={() => setRoom(null)} demoAllowed={allowDemo || !!list?.demo} />;
  if (err) return <p className="text-sm text-rose-300">{err}</p>;
  if (!list) return <p className="animate-pulse text-sm text-slate-400 motion-reduce:animate-none">Looking for gatherings…</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">Gatherings happen at public parks. Check in with your phone&apos;s location when you&apos;re there (we only keep a yes/no, never where you are), then play together to meet a gathering spirit.</p>
      {!list.gatherings.length && <p className="text-sm text-slate-400">No gatherings right now. They run 11:00–20:00 every day.</p>}
      {list.gatherings.map((g) => (
        <button key={g.id} type="button" onClick={() => setRoom(g.id)} className="flex w-full items-center justify-between rounded-lg bg-white/5 p-2 text-left text-sm hover:bg-white/10">
          <span>{g.name}<span className="block text-xs text-slate-400">{g.neighborhood} · until {new Date(g.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></span>
          <span className="text-xs text-slate-300">{g.checkedIn}/{g.min_players} here {g.me && "· you ✓"}</span>
        </button>
      ))}
    </div>
  );
}
function GatheringRoom({ id, onBack, demoAllowed }: { id: string; onBack: () => void; demoAllowed: boolean }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [msg, setMsg] = useState("");
  const [playing, setPlaying] = useState(false);
  const [online, setOnline] = useState<string[]>([]);
  const me = useGame((s) => s.me);
  const load = useCallback(() => api<Room>(`/api/gatherings/${id}`).then(setRoom, (e) => setMsg((e as Error).message)), [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  // Realtime lobby: presence carries profile cards only — never positions (spec §14.3/§14.5)
  const joined = useRef(false);
  useEffect(() => {
    if (!room?.checkedIn || joined.current) return;
    joined.current = true;
    const ch = supabase().channel(`gathering:${id}`, { config: { presence: { key: me?.profile?.handle ?? "wanderer" } } });
    ch.on("presence", { event: "sync" }, () => setOnline(Object.keys(ch.presenceState())))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") ch.track({ handle: me?.profile?.handle, companion: me?.companion?.species ?? null });
      });
    return () => {
      supabase().removeChannel(ch);
      joined.current = false;
    };
  }, [room?.checkedIn, id, me]);

  const checkin = (demo: boolean) => {
    setMsg("");
    const send = (body: object) => api(`/api/gatherings/${id}/checkin`, { method: "POST", body: JSON.stringify(body) }).then(() => load(), (e) => setMsg((e as Error).message));
    if (demo) return send({ demo: true });
    if (!navigator.geolocation) return setMsg("Location isn't available on this device.");
    navigator.geolocation.getCurrentPosition(
      (p) => send({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => setMsg("We need your location (just once) to check you in."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const played = (score: number, durationMs: number) => {
    setPlaying(false);
    api<{ result: string }>(`/api/gatherings/${id}/play`, { method: "POST", body: JSON.stringify({ score, durationMs }) }).then(() => { load(); refreshMe(); }, (e) => setMsg((e as Error).message));
  };

  if (!room) return <p className="animate-pulse text-sm text-slate-400 motion-reduce:animate-none">Joining…</p>;
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs text-slate-400 underline">← all gatherings</button>
      <div className="flex items-start gap-3">
        {room.spirit && <SpiritPortrait family={room.spirit.family} rarity={room.spirit.rarity} seed={room.spirit.seed} look={room.spirit.look} size={64} />}
        <div>
          <p className="font-pixel text-lg">{room.event.name}</p>
          {room.spirit && <p className="text-xs text-slate-300">{room.spirit.name} appears only when wanderers gather. {room.spirit.persona}</p>}
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Here: {room.roster.map((r) => r.handle + (r.demo ? " (demo)" : "")).join(", ") || "nobody yet"} · online now: {online.length} · played {room.played}/{room.event.min_players}
        {room.teamScore !== null && ` · team score ${Math.round(room.teamScore * 100)}%`}
      </p>
      {msg && <p className="text-sm text-rose-300">{msg}</p>}
      {room.result === "success" && <p className="rounded bg-fuchsia-500/15 px-3 py-2 text-sm text-fuchsia-100">✦ The gathering spirit befriends everyone here! It&apos;s in your Atlas.</p>}
      {room.result === "failed" && <p className="text-sm text-slate-300">The spirit drifts off — the team score wasn&apos;t quite enough this time.</p>}
      {!room.checkedIn ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => checkin(false)} className="rounded bg-amber-300 px-3 py-1.5 text-sm text-slate-900">Check in here</button>
          {demoAllowed && <button type="button" onClick={() => checkin(true)} className="rounded border border-amber-300/40 px-3 py-1.5 text-sm text-amber-100">DEMO CHECK-IN</button>}
        </div>
      ) : playing ? (
        <RhythmGame game={room.game} onDone={played} />
      ) : !room.youPlayed && room.result === "pending" ? (
        <button type="button" onClick={() => setPlaying(true)} className="rounded bg-amber-300 px-3 py-1.5 font-pixel text-slate-900">Play the gathering song</button>
      ) : room.result === "pending" ? (
        <p className="text-sm text-slate-300">Waiting for {room.event.min_players - room.played} more to play…</p>
      ) : null}
    </div>
  );
}

// ───────────────────────── Me / profiles ─────────────────────────
function CompanionCanvas({ species, form, traits }: { species: string; form: number; traits: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, COMPANION_PX, COMPANION_PX);
    drawCompanion(ctx, species, form, traits, 0);
  }, [species, form, traits]);
  return <canvas ref={ref} width={COMPANION_PX} height={COMPANION_PX} style={{ width: 72, height: 72, imageRendering: "pixelated" }} aria-hidden />;
}
type PublicProfile = { handle: string; home_hood: string | null; companion: { species: string; form: number; traits: string[] } | null; stats: { friends: number; neighborhoods: number; wishes: number }; favorites: { spirit_name: string; family: string; rarity: string; look: string | null; sprite_seed: number }[] };
function MeTab() {
  const me = useGame((s) => s.me);
  const devAllowed = useGame((s) => !!s.conditions?.devAllowed);
  const [lookup, setLookup] = useState("");
  const [found, setFound] = useState<PublicProfile | null>(null);
  const [msg, setMsg] = useState("");
  if (!me?.profile) return null;
  const c = me.companion;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {c && <CompanionCanvas species={c.species} form={c.form} traits={c.traits} />}
        <div className="text-sm">
          <p className="font-pixel text-xl">{me.profile.handle}</p>
          <p className="text-slate-400">Crew: {me.profile.home_hood}</p>
          {c && <p className="text-slate-400">{COMPANIONS[c.species as keyof typeof COMPANIONS]?.name} · form {c.form}/3 · {c.xp} xp{c.traits.length ? ` · ${c.traits.join(", ")}` : ""}</p>}
        </div>
      </div>
      <p className="text-sm text-slate-300">{me.stats.friends} friends · {me.stats.hoods} neighborhoods explored · {me.stats.wishes} wishes granted</p>
      <ul className="grid grid-cols-2 gap-1 text-xs">
        {(["crew", "trading", "gatherings", "profiles"] as const).map((k) => (
          <li key={k} className={`rounded px-2 py-1 ${me.unlocks[k] ? "bg-emerald-400/15 text-emerald-100" : "bg-white/5 text-slate-500"}`}>{me.unlocks[k] ? "✓" : "🔒"} {k}</li>
        ))}
      </ul>
      {devAllowed && (
        <label className="flex items-center gap-2 text-xs text-amber-200">
          <input type="checkbox" checked={me.profile.demo_mode} onChange={(e) => api("/api/profile/me", { method: "POST", body: JSON.stringify({ demo: e.target.checked }) }).then(() => refreshMe())} />
          Demo mode (unlock everything)
        </label>
      )}
      <div className="space-y-2 border-t border-white/10 pt-3">
        <p className="text-sm">Look up a wanderer</p>
        <div className="flex gap-1">
          <input value={lookup} onChange={(e) => setLookup(e.target.value.toLowerCase())} onKeyDown={stop} placeholder="name" className="min-w-0 flex-1 rounded bg-slate-950 px-2 py-1 text-sm" />
          <button type="button" onClick={() => api<PublicProfile>(`/api/profile/${encodeURIComponent(lookup)}`).then((p) => { setFound(p); setMsg(""); }, (e) => { setFound(null); setMsg((e as Error).message); })} className="rounded bg-white/10 px-2 text-sm">Find</button>
        </div>
        {msg && <p className="text-xs text-rose-300">{msg}</p>}
        {found && (
          <div className="flex items-center gap-3 rounded-lg bg-white/5 p-2 text-sm">
            {found.companion && <CompanionCanvas species={found.companion.species} form={found.companion.form} traits={found.companion.traits} />}
            <div>
              <p className="font-pixel">{found.handle} <span className="text-xs text-slate-400">· {found.home_hood}</span></p>
              <p className="text-xs text-slate-400">{found.stats.friends} friends · {found.stats.neighborhoods} hoods · {found.stats.wishes} wishes</p>
              <div className="mt-1 flex gap-1">
                {found.favorites.map((f, i) => <SpiritPortrait key={i} family={f.family} rarity={f.rarity} seed={f.sprite_seed} look={f.look} size={32} animate={false} />)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

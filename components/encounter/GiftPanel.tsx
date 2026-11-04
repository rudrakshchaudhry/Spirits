"use client";
import { useEffect, useState } from "react";
import KeepsakeIcon from "@/components/KeepsakeIcon";
import { api } from "@/lib/game/api";
import type { GiftResponse, InventoryResponse } from "@/lib/encounter/types";
import { keepsake } from "@/lib/keepsakes/catalog";

/** Pick a keepsake to offer (spec §8.1 "gift (optional)"). */
export default function GiftPanel({ token, onResult, onCancel }: { token: string; onResult: (r: GiftResponse) => void; onCancel: () => void }) {
  const [items, setItems] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<InventoryResponse>("/api/inventory").then((r) => setItems(r.items), (e) => setErr((e as Error).message));
  }, []);

  const give = async (type: string) => {
    setBusy(type);
    try {
      onResult(await api<GiftResponse>("/api/encounter/gift", { method: "POST", body: JSON.stringify({ token, keepsake: type }) }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const entries = items ? Object.entries(items).sort((a, b) => keepsake(a[0]).label.localeCompare(keepsake(b[0]).label)) : [];
  return (
    <div className="space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-200">Offer a keepsake</p>
        <button type="button" onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-200">
          Not now
        </button>
      </div>
      {err && <p className="text-xs text-rose-300">{err}</p>}
      {!items && !err && <p className="animate-pulse text-xs text-slate-400 motion-reduce:animate-none">Checking your pockets…</p>}
      {items && !entries.length && <p className="text-xs text-slate-400">Your pockets are empty. Look for glints on the ground as you walk.</p>}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {entries.map(([type, qty]) => (
          <button
            key={type}
            type="button"
            disabled={!!busy}
            onClick={() => give(type)}
            className="flex items-center gap-2 rounded bg-slate-950/40 px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-950/70 disabled:opacity-50"
          >
            <KeepsakeIcon type={type} size={20} />
            <span className="min-w-0 flex-1 truncate">{keepsake(type).label}</span>
            <span className="font-mono text-slate-400">×{qty}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

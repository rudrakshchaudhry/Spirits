/**
 * Tiny typed event bus between Phaser scenes and React overlays.
 * Phaser emits gameplay events (later: `encounter:start`); React emits commands.
 */
export type BusEvents = {
  "player:teleport": { x: number; y: number };
  "neighborhood:enter": { name: string };
  "spirit:befriended": { spiritId: string };
};

type Handler<K extends keyof BusEvents> = (payload: BusEvents[K]) => void;
const handlers = new Map<keyof BusEvents, Set<Handler<never>>>();

export const bus = {
  on<K extends keyof BusEvents>(event: K, fn: Handler<K>) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(fn as Handler<never>);
    return () => handlers.get(event)?.delete(fn as Handler<never>);
  },
  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]) {
    handlers.get(event)?.forEach((fn) => (fn as Handler<K>)(payload));
  },
};

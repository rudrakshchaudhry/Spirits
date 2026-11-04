"use client";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/game/store";

const RADIUS = 48;

/** Floating touch joystick: appears where your thumb lands in the lower-left half. */
export default function Joystick() {
  const setJoystick = useGame((s) => s.setJoystick);
  const [touch, setTouch] = useState(false);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointerId = useRef<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setTouch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (!touch) return null;

  const move = (e: React.PointerEvent, o = origin) => {
    if (!o) return;
    let dx = e.clientX - o.x, dy = e.clientY - o.y;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) { dx = (dx / d) * RADIUS; dy = (dy / d) * RADIUS; }
    setKnob({ x: dx, y: dy });
    const n = Math.hypot(dx, dy) / RADIUS;
    setJoystick(n < 0.15 ? 0 : dx / RADIUS, n < 0.15 ? 0 : dy / RADIUS);
  };
  const end = () => {
    pointerId.current = null;
    setOrigin(null);
    setKnob({ x: 0, y: 0 });
    setJoystick(0, 0);
  };

  return (
    <div
      className="absolute bottom-0 left-0 h-1/2 w-1/2 touch-none select-none"
      onPointerDown={(e) => {
        if (pointerId.current !== null) return;
        pointerId.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const o = { x: e.clientX, y: e.clientY };
        const r = e.currentTarget.getBoundingClientRect();
        setOffset({ x: r.left, y: r.top });
        setOrigin(o);
        move(e, o);
      }}
      onPointerMove={(e) => e.pointerId === pointerId.current && move(e)}
      onPointerUp={(e) => e.pointerId === pointerId.current && end()}
      onPointerCancel={(e) => e.pointerId === pointerId.current && end()}
    >
      {origin ? (
        <div
          className="pointer-events-none absolute rounded-full border-2 border-white/50 bg-black/20"
          style={{ left: origin.x - offset.x - RADIUS, top: origin.y - offset.y - RADIUS, width: RADIUS * 2, height: RADIUS * 2 }}
        >
          <div
            className="absolute h-12 w-12 rounded-full bg-white/70 shadow"
            style={{ left: RADIUS - 24 + knob.x, top: RADIUS - 24 + knob.y }}
          />
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-10 left-10 h-24 w-24 rounded-full border-2 border-white/30 bg-black/10" />
      )}
    </div>
  );
}

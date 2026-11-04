"use client";
import { useEffect, useRef } from "react";
import { ICON_PX, drawKeepsake } from "@/game/keepsakeArt";

export default function KeepsakeIcon({ type, size = 24 }: { type: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, ICON_PX, ICON_PX);
    drawKeepsake(ctx, type);
  }, [type]);
  return <canvas ref={ref} width={ICON_PX} height={ICON_PX} style={{ width: size, height: size, imageRendering: "pixelated" }} aria-hidden />;
}

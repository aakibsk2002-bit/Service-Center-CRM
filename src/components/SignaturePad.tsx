"use client";

import { useEffect, useRef, useState } from "react";

/** Simple canvas signature pad (mouse / touch / pen). */
export default function SignaturePad({
  onSave,
  onCancel,
}: {
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * ref.current!.width,
      y: ((e.clientY - r.top) / r.height) * ref.current!.height,
    };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    ref.current!.setPointerCapture(e.pointerId);
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setEmpty(false);
  }
  function up() {
    drawing.current = false;
  }
  function clear() {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  }
  function save() {
    ref.current!.toBlob((b) => b && onSave(b), "image/png");
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={ref}
        width={600}
        height={220}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
      />
      <div className="flex gap-2">
        <button onClick={clear} className="rounded-lg border px-3 py-1.5 text-sm">
          Clear
        </button>
        <button onClick={onCancel} className="rounded-lg border px-3 py-1.5 text-sm">
          Cancel
        </button>
        <button
          disabled={empty}
          onClick={save}
          className="ml-auto rounded-lg bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-40"
        >
          Save signature
        </button>
      </div>
    </div>
  );
}

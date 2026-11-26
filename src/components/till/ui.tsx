"use client";
import { useEffect } from "react";

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose?: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`max-h-[95vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-md"}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          {onClose && <button onClick={onClose} className="rounded-lg px-2 py-1 text-2xl leading-none text-slate-400 hover:bg-slate-100" aria-label="Close">×</button>}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Touch-friendly numeric keypad. Works with a physical keyboard too. */
export function Keypad({ value, onChange, onEnter, maxLength = 9, mask = false, decimal = false, enterLabel = "Enter" }: {
  value: string; onChange: (v: string) => void; onEnter?: () => void; maxLength?: number; mask?: boolean; decimal?: boolean; enterLabel?: string;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (/^\d$/.test(e.key) && value.length < maxLength) onChange(value + e.key);
      else if (e.key === "." && decimal && !value.includes(".")) onChange(value + ".");
      else if (e.key === "Backspace") onChange(value.slice(0, -1));
      else if (e.key === "Enter") onEnter?.();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [value, onChange, onEnter, maxLength, decimal]);
  const press = (k: string) => {
    if (k === "⌫") onChange(value.slice(0, -1));
    else if (k === "C") onChange("");
    else if (k === "." && (!decimal || value.includes("."))) return;
    else if (value.length < maxLength) onChange(value + k);
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "C", "0", "⌫"];
  return (
    <div>
      <div className="mb-3 flex h-14 items-center justify-center rounded-xl bg-slate-100 text-3xl font-bold tracking-widest tabular-nums">
        {mask ? "•".repeat(value.length) : value || <span className="text-slate-300">0</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} className="h-14 rounded-xl bg-white text-xl font-semibold ring-1 ring-slate-200 active:bg-slate-100">{k}</button>
        ))}
      </div>
      {onEnter && <button type="button" onClick={onEnter} className="btn-primary mt-3 h-14 w-full text-lg">{enterLabel}</button>}
    </div>
  );
}

export function beep(ok = true) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 1400 : 220;
    g.gain.value = 0.05;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.06 : 0.3));
  } catch {}
}

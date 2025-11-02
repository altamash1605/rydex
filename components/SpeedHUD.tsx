'use client';

export default function SpeedHUD() {
  return (
    <div className="w-full max-w-xs rounded-3xl border border-black/5 bg-white/90 px-6 py-4 text-gray-900 shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur">
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-baseline gap-2 font-semibold tracking-tight">
          <span className="text-3xl leading-none">--.--</span>
          <span className="text-sm uppercase text-gray-500 tracking-[0.35em]">kmh</span>
        </div>
        <div className="text-xs font-medium uppercase tracking-[0.25em] text-gray-400">
          acc: 2m dist: 0.2km
        </div>
      </div>
    </div>
  );
}

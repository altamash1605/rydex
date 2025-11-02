'use client';

export default function SpeedHUD() {
  return (
    <div className="bg-black/70 text-white rounded-xl py-3 px-4 shadow-lg backdrop-blur-sm border border-white/10">
      <div className="text-center font-semibold text-lg">--.-- km/h</div>
      <div className="text-center text-xs text-gray-300 mt-1">acc: 2m dist: 0.2km</div>
    </div>
  );
}

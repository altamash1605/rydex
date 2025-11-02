'use client';

export default function SpeedHUD() {
  return (
    <div className="bg-white/90 backdrop-blur-sm text-center text-black font-semibold rounded-xl py-3 shadow-md border border-gray-200">
      <div className="text-lg">Speed: 25 km/h</div>
      <div className="text-sm text-gray-600">Status: Riding</div>
    </div>
  );
}

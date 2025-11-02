'use client';

import { Map } from 'leaflet';

export default function RecenterButton({
  mapRef,
  setUserPanned,
}: {
  mapRef: React.MutableRefObject<Map | null>;
  setUserPanned: (value: boolean) => void;
}) {
  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], map.getZoom());
        setUserPanned(false);
      });
    }
  };

  return (
    <button
      onClick={handleRecenter}
      className="bg-white shadow-lg rounded-full p-3 border border-gray-200 hover:bg-gray-100 active:scale-95 transition-all"
      style={{ width: 48, height: 48 }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="black"
        className="w-5 h-5 mx-auto"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
        <circle cx="12" cy="12" r="9" stroke="black" strokeWidth="2" fill="none" />
      </svg>
    </button>
  );
}

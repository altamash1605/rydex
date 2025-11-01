'use client';

import { Crosshair } from 'lucide-react';
import { useState } from 'react';

type Props = {
  onClick?: () => void;
  visible?: boolean;
};

export default function RecenterButton({ onClick, visible = true }: Props) {
  const [clicked, setClicked] = useState(false);

  if (!visible) return null;

  const handleClick = () => {
    console.log('🧭 Recenter button clicked!');
    setClicked(true);

    // 🔹 Fire global event so MapView can recenter
    window.dispatchEvent(new CustomEvent('rydex-recenter'));

    if (onClick) onClick();

    setTimeout(() => setClicked(false), 300);
  };

  return (
    <div
      style={{
        position: 'absolute',          // ✅ anchor within map wrapper
        bottom: '20px',
        right: '20px',                 // ✅ moved to bottom-right corner (safer on mobile)
        zIndex: 9999999,               // ✅ always on top
        pointerEvents: 'auto',
      }}
      className="pointer-events-auto"
    >
      <button
        onClick={handleClick}
        className="bg-white rounded-full border-2 border-gray-700 shadow-lg p-3 hover:bg-gray-100 active:scale-95 transition-all"
        style={{
          boxShadow: '0 3px 12px rgba(0,0,0,0.35)',
          background: clicked ? '#cce5ff' : 'white',
        }}
        title="Recenter map"
      >
        <Crosshair className="w-6 h-6 text-gray-700" />
      </button>
    </div>
  );
}

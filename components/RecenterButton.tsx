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
    setClicked(true);
    window.dispatchEvent(new CustomEvent('rydex-recenter'));
    if (onClick) onClick();
    setTimeout(() => setClicked(false), 300);
  };

  return (
    <button
      onClick={handleClick}
      className={`
        fixed                          /* ✅ use fixed so it's anchored to viewport */
        bottom-6 right-6               /* ✅ visible in all devices */
        z-[9999999]                    /* ✅ topmost layer */
        bg-white text-gray-700 
        rounded-full border-2 border-gray-700 
        shadow-lg p-3 
        hover:bg-gray-100 active:scale-95 
        transition-all
      `}
      style={{
        boxShadow: '0 3px 12px rgba(0,0,0,0.35)',
        background: clicked ? '#cce5ff' : 'white',
        pointerEvents: 'auto',
      }}
      title="Recenter map"
    >
      <Crosshair className="w-6 h-6 text-gray-700" />
    </button>
  );
}

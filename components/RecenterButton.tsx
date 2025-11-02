'use client';

import { useEffect, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { createPortal } from 'react-dom';

type Props = {
  onClick?: () => void;
  visible?: boolean;
};

export default function RecenterButton({ onClick, visible = true }: Props) {
  const [mounted, setMounted] = useState(false);
  const [clicked, setClicked] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleClick = () => {
    console.log('🧭 Recenter clicked');
    setClicked(true);
    window.dispatchEvent(new CustomEvent('rydex-recenter'));
    if (onClick) onClick();
    setTimeout(() => setClicked(false), 300);
  };

  if (!mounted || !visible) return null;

  const button = (
    <button
      onClick={handleClick}
      className={`
        fixed bottom-6 right-6
        z-[9999999]
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

  // ✅ Mount into body instead of inside map
  return createPortal(button, document.body);
}

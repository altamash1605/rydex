'use client';

import { Crosshair } from 'lucide-react';
import { useState } from 'react';

type Props = {
  onClick: () => void;
  visible?: boolean;
};

export default function RecenterButton({ onClick, visible = true }: Props) {
  const [clicked, setClicked] = useState(false);

  if (!visible) return null;

  return (
    <button
      onClick={() => {
        console.log('🧭 Button clicked!');
        setClicked(true);
        onClick();
        setTimeout(() => setClicked(false), 300);
      }}
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        zIndex: 999999,
        background: clicked ? '#cce5ff' : 'white',
        border: '2px solid #444',
        borderRadius: '50%',
        padding: '12px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        cursor: 'pointer',
        pointerEvents: 'auto',
      }}
      title="Recenter map"
    >
      <Crosshair className="w-6 h-6 text-gray-700" />
    </button>
  );
}

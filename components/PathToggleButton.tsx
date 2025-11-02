'use client';

interface PathToggleButtonProps {
  isActive: boolean;
  onToggle: () => void;
}

export default function PathToggleButton({ isActive, onToggle }: PathToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-[0_12px_28px_rgba(15,23,42,0.22)] transition-all hover:bg-slate-50 active:scale-95 ${
        isActive ? 'ring-2 ring-offset-2 ring-slate-400' : ''
      }`}
      aria-pressed={isActive}
      aria-label={isActive ? 'Hide path' : 'Show path'}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-5 w-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 6.5c2.5-1.5 5.5-1.5 8 0s5.5 1.5 8 0M5 12c2.5-1.5 5.5-1.5 8 0s5.5 1.5 8 0M5 17.5c2.5-1.5 5.5-1.5 8 0s5.5 1.5 8 0"
        />
      </svg>
    </button>
  );
}

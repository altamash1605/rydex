'use client';

export default function RecenterButton({
  onRecenter,
  isFollowing,
}: {
  onRecenter: () => void;
  isFollowing: boolean;
}) {
  const handleRecenter = () => {
    onRecenter();
  };

  return (
    <button
      type="button"
      onClick={handleRecenter}
      className={`flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.25)] transition-all hover:bg-slate-50 active:scale-95 ${
        isFollowing ? 'ring-2 ring-offset-2 ring-slate-400' : ''
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-5 w-5"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5V3m0 18v-2m7-7h2M3 12h2" />
        <circle cx="12" cy="12" r="5" fill="none" />
      </svg>
    </button>
  );
}

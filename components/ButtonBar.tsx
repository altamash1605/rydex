'use client';

type ButtonProps = {
  label: string;
  onClick: () => void;
};

function RideButton({ label, onClick }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      className="bg-black text-white font-semibold rounded-xl px-5 py-3 mx-1 shadow-md active:scale-95 transition-all"
    >
      {label}
    </button>
  );
}

export default function ButtonBar() {
  return (
    <div className="flex justify-center bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg px-3 py-2">
      <RideButton label="Go to Pickup" onClick={() => console.log('Go to Pickup')} />
      <RideButton label="Start Ride" onClick={() => console.log('Start Ride')} />
      <RideButton label="End Ride" onClick={() => console.log('End Ride')} />
      <RideButton label="Abort" onClick={() => console.log('Abort')} />
    </div>
  );
}

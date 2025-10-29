// src/utils/haptics.ts
export const Haptics = {
  startRide: () => navigator.vibrate?.(100),
  endRide: () => navigator.vibrate?.([50, 50, 150]),
  short: () => navigator.vibrate?.(50),
  long: () => navigator.vibrate?.(200),
};


export const haptics = {
  startRide: () => navigator.vibrate?.([80, 40, 80]),
  endRide: () => navigator.vibrate?.(200),
  idle: () => navigator.vibrate?.(50),
};

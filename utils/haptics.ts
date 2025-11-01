import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Light tap
export const haptics = {
  tap: async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (err) {
      console.warn('Haptics not supported:', err);
    }
  },
  heavy: async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (err) {
      console.warn('Haptics not supported:', err);
    }
  },
};

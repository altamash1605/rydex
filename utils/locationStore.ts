export type LatLng = [number, number];

export interface LocationState {
  path: LatLng[];
  current: LatLng | null;
}

const STORAGE_KEY = 'rydex:location:path';
const MAX_POINTS = 5000;

let state: LocationState = {
  path: [],
  current: null,
};

let loaded = false;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<(state: LocationState) => void>();

function cloneTuple(tuple: LatLng | null): LatLng | null {
  return tuple ? ([tuple[0], tuple[1]] as LatLng) : null;
}

function notifySubscribers() {
  const snapshot: LocationState = {
    path: state.path.map((point) => [point[0], point[1]] as LatLng),
    current: cloneTuple(state.current),
  };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (err) {
      console.warn('Location store listener failed:', err);
    }
  });
}

async function hydrateFromStorage() {
  if (typeof window === 'undefined') {
    state = { path: [], current: null };
    return;
  }

  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      state = { path: [], current: null };
      return;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      state = { path: [], current: null };
      return;
    }

    const sanitized: LatLng[] = parsed
      .map((item) => {
        if (!Array.isArray(item) || item.length < 2) return null;
        const lat = Number(item[0]);
        const lng = Number(item[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return [lat, lng] as LatLng;
      })
      .filter((point): point is LatLng => Boolean(point));

    const trimmed =
      sanitized.length > MAX_POINTS
        ? sanitized.slice(sanitized.length - MAX_POINTS)
        : sanitized;

    state = {
      path: trimmed,
      current: trimmed.length ? cloneTuple(trimmed[trimmed.length - 1]) : null,
    };
  } catch (err) {
    console.warn('Failed to hydrate location history:', err);
    state = { path: [], current: null };
  }
}

async function ensureHydrated(force = false) {
  if (force) {
    loaded = false;
  }

  if (loaded) {
    return;
  }

  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      await hydrateFromStorage();
      loaded = true;
    })().finally(() => {
      hydrationPromise = null;
    });
  }

  await hydrationPromise;
}

function persistPath(path: LatLng[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(path));
  } catch (err) {
    console.warn('Failed to persist location history:', err);
  }
}

function setState(next: LocationState, { persist = true }: { persist?: boolean } = {}) {
  state = {
    path: next.path.map((point) => [point[0], point[1]] as LatLng),
    current: cloneTuple(next.current),
  };
  if (persist) {
    persistPath(state.path);
  }
  notifySubscribers();
}

export async function recordLocation(point: LatLng, accuracy?: number) {
  if (!point) return;
  const [lat, lng] = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (accuracy != null && Number.isFinite(accuracy) && accuracy > 20) {
    return;
  }

  await ensureHydrated();

  const last = state.path[state.path.length - 1];
  const shouldAppend =
    !last || Math.hypot(lat - last[0], lng - last[1]) > 0.00001;

  const nextPath = shouldAppend
    ? (() => {
        const appended = [...state.path, [lat, lng] as LatLng];
        return appended.length > MAX_POINTS
          ? appended.slice(appended.length - MAX_POINTS)
          : appended;
      })()
    : state.path.map((p) => [p[0], p[1]] as LatLng);

  setState(
    {
      path: nextPath,
      current: [lat, lng],
    },
    { persist: shouldAppend }
  );

  if (!shouldAppend) {
    // We skipped persisting because the path didn't change; ensure the current point is saved.
    persistPath(state.path);
  }
}

export async function initializeLocationStore() {
  await ensureHydrated();
  return getLocationState();
}

export function getLocationState(): LocationState {
  return {
    path: state.path.map((point) => [point[0], point[1]] as LatLng),
    current: cloneTuple(state.current),
  };
}

export function subscribeToLocationStore(listener: (state: LocationState) => void) {
  listeners.add(listener);
  listener(getLocationState());
  return () => {
    listeners.delete(listener);
  };
}

export async function reloadLocationStoreFromStorage() {
  await ensureHydrated(true);
  notifySubscribers();
  return getLocationState();
}

export async function clearLocationHistory() {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear location history:', err);
    }
  }
  setState({ path: [], current: null }, { persist: false });
}

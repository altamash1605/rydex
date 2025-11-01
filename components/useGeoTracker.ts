import { useEffect, useRef, useState } from 'react';

// --- helper: Haversine distance (in meters) ---
function haversineM(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// --- Improved Kalman smoother ---
class SimpleKalman {
  pos: [number, number];
  vel: [number, number];
  processNoise = 0.00002; // tuned for 2–3m accuracy
  measureNoise = 0.0003;

  constructor(lat: number, lng: number) {
    this.pos = [lat, lng];
    this.vel = [0, 0];
  }

  update(lat: number, lng: number, dt: number) {
    this.pos[0] += this.vel[0] * dt;
    this.pos[1] += this.vel[1] * dt;
    const k = this.processNoise / (this.processNoise + this.measureNoise);
    const newVel: [number, number] = [(lat - this.pos[0]) / dt, (lng - this.pos[1]) / dt];
    this.vel[0] = this.vel[0] * (1 - k) + newVel[0] * k;
    this.vel[1] = this.vel[1] * (1 - k) + newVel[1] * k;
    this.pos[0] += k * (lat - this.pos[0]);
    this.pos[1] += k * (lng - this.pos[1]);
  }

  predict(dt: number) {
    return [this.pos[0] + this.vel[0] * dt, this.pos[1] + this.vel[1] * dt] as [number, number];
  }
}

// --- Main Hook ---
export function useGeoTracker() {
  const [path, setPath] = useState<[number, number][]>([]);
  const kalmanRef = useRef<SimpleKalman | null>(null);
  const lastFixTime = useRef<number | null>(null);
  const lastFix = useRef<[number, number] | null>(null);
  const currentPos = useRef<[number, number] | null>(null);
  const smoothedSpeed = useRef(0); // computed m/s

  // Thresholds for motion & filtering
  const SPEED_THRESHOLD = 0.5; // m/s
  const DIST_THRESHOLD = 2;   // m

  useEffect(() => {
    if (typeof navigator === 'undefined') return;

    // ✅ Warm-up GPS (forces hardware GPS before tracking)
    navigator.geolocation.getCurrentPosition(
      () => console.log('✅ GPS warm-up successful'),
      (e) => console.warn('⚠️ GPS warm-up failed', e),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );

    // ✅ Start continuous GPS tracking
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;

        // Skip inaccurate readings (>20 m)
        if (accuracy > 20) {
          console.warn('Skipping low-accuracy fix:', accuracy);
          return;
        }

        const coords: [number, number] = [latitude, longitude];
        const now = Date.now();
        const dt = lastFixTime.current ? (now - lastFixTime.current) / 1000 : 1;
        const dist = lastFix.current ? haversineM(lastFix.current, coords) : 0;
        const rawSpeed = dist / dt;

        // Smooth speed
        smoothedSpeed.current = smoothedSpeed.current * 0.7 + rawSpeed * 0.3;

        // Update fix references
        lastFix.current = coords;
        lastFixTime.current = now;

        // Initialize Kalman on first fix
        if (!kalmanRef.current) {
          kalmanRef.current = new SimpleKalman(coords[0], coords[1]);
          currentPos.current = coords;
          setPath([coords]);
          return;
        }

        // Update Kalman
        kalmanRef.current.update(coords[0], coords[1], dt);

        // Add to path if significant movement
        if (smoothedSpeed.current > SPEED_THRESHOLD && dist > DIST_THRESHOLD) {
          setPath((p) => [...p, coords]);
        }

        // ✅ Gentle position smoothing (type-safe)
        const prev: [number, number] = currentPos.current ?? coords;
        const smooth = (a: [number, number], b: [number, number]): [number, number] => [
          a[0] * 0.8 + b[0] * 0.2,
          a[1] * 0.8 + b[1] * 0.2,
        ];
        currentPos.current = smooth(prev, coords);
      },
      (err) => console.error('GPS error:', err),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  // --- Prediction & lag compensation loop ---
  useEffect(() => {
    let raf: number;
    const LAG = 500; // ms lag for smoother marker
    const loop = () => {
      const kf = kalmanRef.current;
      if (kf && lastFixTime.current) {
        const dt = (Date.now() - (lastFixTime.current + LAG)) / 1000;
        currentPos.current = kf.predict(dt);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { path, currentPos };
}

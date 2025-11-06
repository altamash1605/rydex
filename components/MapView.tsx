'use client';

import 'leaflet/dist/leaflet.css';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RecenterButton from './RecenterButton';
import SpeedHUD from './SpeedHUD';
import ButtonBar from './ButtonBar';
import PathToggleButton from './PathToggleButton';
import { useGeoTracker } from './useGeoTracker';
import { useLeafletLayers } from './useLeafletLayers';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import DriverHeatmap from './DriverHeatmap';

function getOrCreateDeviceId(): string {
  try {
    const key = 'rydex-device-id';
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    localStorage.setItem(key, uuid);
    return uuid;
  } catch {
    return '00000000-0000-4000-8000-000000000000';
  }
}

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });

export default function MapView() {
  const mapRef = useRef<LeafletMap | null>(null);
  const { currentPos, path } = useGeoTracker();
  useLeafletLayers();

  const initialCenterRef = useRef<[number, number] | null>(null);
  if (initialCenterRef.current === null) {
    initialCenterRef.current = currentPos.current ?? [0, 0];
  }

  const [isFollowing, setIsFollowing] = useState(false);
  const [showPath, setShowPath] = useState(true);
  const isProgrammaticMove = useRef(false);
  const programmaticResetTimeout = useRef<number | null>(null);
  const hasAutoCentered = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  const [markerPosition, setMarkerPosition] = useState<[number, number] | null>(null);
  const markerAnimationFrame = useRef<number | null>(null);
  const markerPositionRef = useRef<[number, number] | null>(null);

  const markProgrammaticMove = () => {
    isProgrammaticMove.current = true;
    if (programmaticResetTimeout.current) {
      window.clearTimeout(programmaticResetTimeout.current);
    }
    programmaticResetTimeout.current = window.setTimeout(() => {
      isProgrammaticMove.current = false;
      programmaticResetTimeout.current = null;
    }, 400);
  };

  const markerIcon = useMemo(
    () =>
      L.divIcon({
        className: 'pulsing-location-marker',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        html: '<span class="pulsing-location-marker__inner"></span>',
      }),
    [],
  );

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    if (!map.getPane('pane-heat')) {
      map.createPane('pane-heat');
      const pane = map.getPane('pane-heat')!;
      pane.classList.add('pane-heat');
      pane.style.pointerEvents = 'none';
    }
  }, [mapReady]);

  /* === Adaptive uploader === */
  useEffect(() => {
    const REF = (process.env.NEXT_PUBLIC_SUPABASE_REF || 'vuymzcnkhzhjuykrfavy').trim();
    const ANON = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    const URL = `https://${REF}.functions.supabase.co/update_driver_location`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ANON) { headers.Authorization = `Bearer ${ANON}`; headers.apikey = ANON; }

    const deviceId = getOrCreateDeviceId();
    const haversineM = (a: [number, number], b: [number, number]) => {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const R = 6371000;
      const dLat = toRad(b[0] - a[0]);
      const dLng = toRad(b[1] - a[1]);
      const lat1 = toRad(a[0]);
      const lat2 = toRad(b[0]);
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    };

    const FAST_MS = 5000;
    const SLOW_MS = 15000;
    const THRESHOLD_M = 15;

    let lastCoord: [number, number] | null = null;
    let timer: number | undefined;
    let isMounted = true;

    async function send(lat: number, lng: number) {
      try {
        await fetch(URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ lat, lng, ts: Date.now(), driver_id: deviceId }),
        });
      } catch {}
    }

    function schedule(nextMs: number) {
      if (!isMounted) return;
      timer = window.setTimeout(tick, nextMs);
    }

    async function tick() {
      if (!isMounted) return;
      const coords = currentPos.current;
      if (!coords) { schedule(SLOW_MS); return; }
      const [lat, lng] = coords;
      let moved = true;
      if (lastCoord) moved = haversineM(lastCoord, coords) >= THRESHOLD_M;
      await send(lat, lng);
      lastCoord = coords;
      schedule(moved ? FAST_MS : SLOW_MS);
    }

    tick();
    return () => {
      isMounted = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    markerPositionRef.current = markerPosition;
  }, [markerPosition]);

  useEffect(() => {
    return () => {
      if (markerAnimationFrame.current != null) {
        window.cancelAnimationFrame(markerAnimationFrame.current);
      }
    };
  }, []);

  const animateMarker = useCallback(
    (target: [number, number]) => {
      if (!target) return;
      const start = markerPositionRef.current;
      if (!start) {
        markerPositionRef.current = target;
        setMarkerPosition(target);
        return;
      }
      if (start[0] === target[0] && start[1] === target[1]) return;
      if (markerAnimationFrame.current != null) {
        window.cancelAnimationFrame(markerAnimationFrame.current);
      }
      const startTime = performance.now();
      const duration = 650;

      const step = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const nextLat = start[0] + (target[0] - start[0]) * eased;
        const nextLng = start[1] + (target[1] - start[1]) * eased;
        const nextPos: [number, number] = [nextLat, nextLng];
        markerPositionRef.current = nextPos;
        setMarkerPosition(nextPos);
        if (t < 1) {
          markerAnimationFrame.current = window.requestAnimationFrame(step);
        } else {
          markerAnimationFrame.current = null;
          markerPositionRef.current = target;
          setMarkerPosition(target);
        }
      };
      markerAnimationFrame.current = window.requestAnimationFrame(step);
    },
    [],
  );

  useEffect(() => {
    const target = currentPos.current;
    if (!target) return;
    animateMarker(target);
  }, [path, currentPos, animateMarker]);

  // Disable auto-follow on manual pan
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleUserMoveStart = () => {
      if (isProgrammaticMove.current) {
        isProgrammaticMove.current = false;
        if (programmaticResetTimeout.current) {
          window.clearTimeout(programmaticResetTimeout.current);
          programmaticResetTimeout.current = null;
        }
        return;
      }
      setIsFollowing(false);
    };
    map.on('movestart', handleUserMoveStart);
    map.on('zoomstart', handleUserMoveStart);
    return () => {
      map.off('movestart', handleUserMoveStart);
      map.off('zoomstart', handleUserMoveStart);
    };
  }, []);

  // Auto-follow (only when isFollowing = true)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !markerPosition) return;
    if (!isFollowing) return;
    markProgrammaticMove();
    map.setView([markerPosition[0], markerPosition[1]], map.getZoom(), { animate: true });
  }, [isFollowing, markerPosition, mapReady]);

  const handleRecenter = () => {
    const map = mapRef.current;
    const coords = currentPos.current;
    if (!map || !coords) return;
    markProgrammaticMove();
    setIsFollowing(true);
    map.setView([coords[0], coords[1]], map.getZoom(), { animate: true });
  };

  const handleTogglePath = () => setShowPath(prev => !prev);

  // --- PATCH START: Fix delayed recenter (run only once, skip if user panned) ---
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const coords = currentPos.current;
    if (!map || !coords) return;

    // Only run the first time map becomes ready
    if (hasAutoCentered.current) return;
    hasAutoCentered.current = true;

    const timeout = window.setTimeout(() => {
      // Only center if user has not manually panned yet
      if (isFollowing === false) {
        markProgrammaticMove();
        setIsFollowing(true);
        map.setView([coords[0], coords[1]], map.getZoom(), { animate: true });
      }
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [mapReady]);
  // --- PATCH END ---

  // (unchanged double-tap zoom section below)
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    map.doubleClickZoom.disable();
    const previousZoomSnap = map.options.zoomSnap;
    const previousZoomDelta = map.options.zoomDelta;
    map.options.zoomSnap = 0;
    map.options.zoomDelta = 0.01;
    const container = map.getContainer();
    const mapPane = map.getPanes().mapPane;
    if (!container || !mapPane) {
      map.options.zoomSnap = previousZoomSnap;
      map.options.zoomDelta = previousZoomDelta;
      map.doubleClickZoom.enable();
      return;
    }
    container.style.touchAction = 'none';
    return () => {
      map.options.zoomSnap = previousZoomSnap;
      map.options.zoomDelta = previousZoomDelta;
      map.doubleClickZoom.enable();
    };
  }, [mapReady]);

  useEffect(() => {
    return () => {
      if (programmaticResetTimeout.current) {
        window.clearTimeout(programmaticResetTimeout.current);
      }
    };
  }, []);

  const handleMapRef = useCallback((instance: LeafletMap | null) => {
    mapRef.current = instance;
    setMapReady(Boolean(instance));
  }, []);

  const markerPoint = markerPosition ?? (currentPos.current ? [currentPos.current[0], currentPos.current[1]] : null);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#111827]">
      <div className="absolute inset-0">
        <MapContainer
          ref={handleMapRef}
          center={initialCenterRef.current!}
          zoom={16}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          doubleClickZoom={false}
          zoomSnap={0}
          zoomDelta={0.01}
        >
          <DriverHeatmap />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors'
          />
          {markerPoint && <Marker position={markerPoint} icon={markerIcon} />}
          {showPath && path.length > 1 && <Polyline positions={path} color="#fb923c" weight={4} />}
        </MapContainer>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-[24%] bg-[linear-gradient(180deg,rgba(17,24,39,0.85)_0%,rgba(17,24,39,0.25)_70%,rgba(17,24,39,0)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-[linear-gradient(180deg,rgba(17,24,39,0)_0%,rgba(17,24,39,0.55)_45%,rgba(17,24,39,0.9)_100%)]" />

      <div
        className="rydex-overlay pointer-events-none absolute inset-x-0 top-0 flex justify-center px-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 1rem) + 1rem)' }}
      >
        <div className="pointer-events-auto w-full max-w-xl">
          <SpeedHUD />
        </div>
      </div>

      <div
        className="rydex-overlay rydex-overlay-bottom pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 sm:px-6"
        style={{ paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 14px) + clamp(1rem, 3.5vw, 1.6rem))' }}
      >
        <div className="pointer-events-auto relative w-full max-w-sm">
          <div className="absolute -top-28 right-2 flex flex-col items-end gap-3">
            <PathToggleButton isActive={showPath} onToggle={() => setShowPath(v => !v)} />
            <RecenterButton onRecenter={handleRecenter} isFollowing={isFollowing} />
          </div>
          <ButtonBar />
        </div>
      </div>
    </div>
  );
}

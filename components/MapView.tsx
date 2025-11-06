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
    // RFC4122 v4 UUID generator
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

  // --- NEW: lock initial center so GPS updates don't recenter via prop changes ---
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

  // Dedicated pane for heat (keeps tiles under markers/UI)
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

  /* === Adaptive uploader: 5s when moving, 15s when stationary (<15 m) === */
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

    const FAST_MS = 5000;   // when moving
    const SLOW_MS = 15000;  // when stationary
    const THRESHOLD_M = 15; // movement threshold

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
      } catch {
        /* ignore transient errors */
      }
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

      // Decide cadence based on movement since last check
      let moved = true;
      if (lastCoord) {
        moved = haversineM(lastCoord, coords) >= THRESHOLD_M;
      }

      // Send now (both modes send; only the interval changes)
      await send(lat, lng);

      // Update lastCoord to current for next movement check
      lastCoord = coords;

      // Schedule next tick based on movement
      schedule(moved ? FAST_MS : SLOW_MS);
    }

    // kick off immediately on mount
    tick();

    return () => {
      isMounted = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []); // uses currentPos via closure


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

  // update marker position smoothly on GPS/path change
  useEffect(() => {
    const target = currentPos.current;
    if (!target) return;
    animateMarker(target);
  }, [path, currentPos, animateMarker]);

  // Detect manual pan to disable following (sticky until user taps recenter)
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
      setIsFollowing(false); // <-- stays false until RecenterButton sets true
    };
    map.on('movestart', handleUserMoveStart);
    map.on('zoomstart', handleUserMoveStart);
    return () => {
      map.off('movestart', handleUserMoveStart);
      map.off('zoomstart', handleUserMoveStart);
    };
  }, []);

  // --- CHANGED: Auto-follow now reacts to marker movement only, not every GPS/path change ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !markerPosition) return;
    if (!isFollowing) return; // respect sticky "manual pan" state
    markProgrammaticMove();
    map.setView([markerPosition[0], markerPosition[1]], map.getZoom(), { animate: true });
  }, [isFollowing, markerPosition, mapReady]);

  const handleRecenter = () => {
    const map = mapRef.current;
    const coords = currentPos.current;
    if (!map || !coords) return;
    markProgrammaticMove();
    setIsFollowing(true); // user explicitly re-enables follow
    map.setView([coords[0], coords[1]], map.getZoom(), { animate: true });
  };

  const handleTogglePath = () => {
    setShowPath(prev => !prev);
  };

  // Initial auto-center once after mount
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const coords = currentPos.current;
    if (!map || !coords || hasAutoCentered.current) return;

    hasAutoCentered.current = true;
    const timeout = window.setTimeout(() => {
      markProgrammaticMove();
      setIsFollowing(true);
      map.setView([coords[0], coords[1]], map.getZoom(), { animate: true });
    }, 2000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [path, mapReady]);

  // --- Smooth double-tap-drag zoom (kept as-is) ---
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

    const prevTouchAction = container.style.touchAction;
    container.style.touchAction = 'none';

    let lastTapTime = 0;
    let pointerId: number | null = null;
    let gestureActive = false;
    let movedDuringGesture = false;
    let startY = 0;
    let startZoom = map.getZoom();
    let anchorPoint: L.Point | null = null;
    let anchorLatLng: L.LatLng | null = null;
    let lastScale = 1;
    let rafId: number | null = null;
    let draggingDisabledForGesture = false;

    const minZoom = map.getMinZoom();
    const maxZoom = map.getMaxZoom();

    const PREVIEW_MIN = 0.6;
    const PREVIEW_MAX = 2.0;
    const COMMIT_STEP = 0.20;

    let zoomAccumulator = 0;
    let lastYDuringGesture = 0;

    const TAP_MIN_MS = 50;
    const TAP_MAX_MS = 350;
    const TAP_MOVE_TOL = 18; // px
    let lastTapPoint: L.Point | null = null;
    let activeTouchCount = 0;

    const cancelAnimation = () => {
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const clearPaneStyles = () => {
      cancelAnimation();
      mapPane.style.transition = '';
      mapPane.style.transform = '';
      mapPane.style.transformOrigin = '';
      mapPane.style.willChange = '';
    };

    const animateBackToIdentity = (withTransition: boolean) => {
      cancelAnimation();
      if (withTransition) {
        mapPane.style.transition = 'transform 150ms ease-out';
        mapPane.style.transform = 'scale(1)';
        let handled = false;
        const handleTransitionEnd = () => {
          handled = true;
          clearPaneStyles();
          mapPane.removeEventListener('transitionend', handleTransitionEnd);
        };
        mapPane.addEventListener('transitionend', handleTransitionEnd);
        window.setTimeout(() => {
          if (!handled) {
            mapPane.removeEventListener('transitionend', handleTransitionEnd);
            clearPaneStyles();
          }
        }, 180);
      } else {
        clearPaneStyles();
      }
    };

    const applyVisualScale = (scale: number) => {
      cancelAnimation();
      rafId = window.requestAnimationFrame(() => {
        mapPane.style.willChange = 'transform';
        mapPane.style.transition = 'none';
        if (anchorPoint) {
          mapPane.style.transformOrigin = `${anchorPoint.x}px ${anchorPoint.y}px`;
        }
        mapPane.style.transform = `scale(${scale})`;
      });
    };

    const endGesture = (commit: boolean) => {
      if (!gestureActive) return;

      gestureActive = false;

      if (pointerId != null && container.releasePointerCapture) {
        try {
          container.releasePointerCapture(pointerId);
        } catch { /* ignore */ }
      }
      pointerId = null;

      if (draggingDisabledForGesture && map.dragging && !map.dragging.enabled()) {
        map.dragging.enable();
      }
      draggingDisabledForGesture = false;

      if (!commit) {
        animateBackToIdentity(false);
        anchorPoint = null;
        anchorLatLng = null;
        lastScale = 1;
        movedDuringGesture = false;
        startZoom = map.getZoom();
        zoomAccumulator = 0;
        return;
      }

      const targetZoom = Math.max(minZoom, Math.min(maxZoom, startZoom + zoomAccumulator));
      animateBackToIdentity(true);

      const focusLatLng = anchorLatLng;
      window.requestAnimationFrame(() => {
        if (focusLatLng) {
          map.setZoomAround(focusLatLng, targetZoom, { animate: true });
        } else {
          map.setZoom(targetZoom, { animate: true });
        }
      });

      anchorPoint = null;
      anchorLatLng = null;
      lastScale = 1;
      movedDuringGesture = false;
      startZoom = map.getZoom();
      zoomAccumulator = 0;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') activeTouchCount++;
      if (event.pointerType !== 'touch') return;

      const now = performance.now();
      const rect = container.getBoundingClientRect();
      const thisTapPoint = L.point(event.clientX - rect.left, event.clientY - rect.top);

      const delta = now - lastTapTime;
      const inTimeWindow = delta >= 50 && delta <= 350;
      const inSpatialWindow = lastTapPoint ? lastTapPoint.distanceTo(thisTapPoint) <= 18 : false;

      if (activeTouchCount === 1 && inTimeWindow && inSpatialWindow) {
        pointerId = event.pointerId;
        anchorPoint = thisTapPoint;
        anchorLatLng = map.containerPointToLatLng(anchorPoint);
        startY = event.clientY;
        startZoom = map.getZoom();
        lastScale = 1;
        movedDuringGesture = false;
        gestureActive = true;

        mapPane.style.transformOrigin = `${anchorPoint.x}px ${anchorPoint.y}px`;

        lastYDuringGesture = event.clientY;
        zoomAccumulator = 0;

        if (map.dragging && map.dragging.enabled()) {
          map.dragging.disable();
          draggingDisabledForGesture = true;
        } else {
          draggingDisabledForGesture = false;
        }

        if (container.setPointerCapture) {
          try { container.setPointerCapture(event.pointerId); } catch { }
        }

        lastTapTime = 0;
        lastTapPoint = null;

        event.preventDefault();
        event.stopPropagation();
        return;
      }

      lastTapTime = now;
      lastTapPoint = thisTapPoint;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!gestureActive || event.pointerId !== pointerId) return;

      const dy = event.clientY - lastYDuringGesture;
      lastYDuringGesture = event.clientY;

      const dz = dy / 200; // 200px ≈ 1 zoom
      zoomAccumulator += dz;

      if (!movedDuringGesture && Math.abs(zoomAccumulator) > 0.01) {
        movedDuringGesture = true;
      }

      const previewScale = Math.pow(2, zoomAccumulator);
      const safePreview = Math.max(0.6, Math.min(2.0, previewScale));
      lastScale = safePreview;
      applyVisualScale(safePreview);

      while (Math.abs(zoomAccumulator) >= 0.20) {
        const step = Math.sign(zoomAccumulator) * 0.20;
        const nextZoom = Math.max(minZoom, Math.min(maxZoom, startZoom + step));

        if (anchorLatLng) {
          map.setZoomAround(anchorLatLng, nextZoom, { animate: false });
        } else {
          map.setZoom(nextZoom, { animate: false });
        }

        startZoom = map.getZoom();
        zoomAccumulator -= step;

        const rescaled = Math.pow(2, zoomAccumulator);
        applyVisualScale(Math.max(0.6, Math.min(2.0, rescaled)));
      }

      event.preventDefault();
      event.stopPropagation();
    };

    const finishGesture = (event: PointerEvent) => {
      if (!gestureActive || (pointerId != null && event.pointerId !== pointerId)) return;

      if (movedDuringGesture) {
        endGesture(true);
      } else {
        endGesture(false);
        map.zoomIn(1, { animate: true });
      }

      lastTapTime = 0;
      event.preventDefault();
      event.stopPropagation();
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') activeTouchCount = Math.max(0, activeTouchCount - 1);
      finishGesture(event);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerType === 'touch') activeTouchCount = Math.max(0, activeTouchCount - 1);
      if (!gestureActive || (pointerId != null && event.pointerId !== pointerId)) return;
      endGesture(false);
      lastTapTime = 0;
    };

    container.addEventListener('pointerdown', handlePointerDown, { passive: false });
    container.addEventListener('pointermove', handlePointerMove, { passive: false });
    container.addEventListener('pointerup', handlePointerUp, { passive: false });
    container.addEventListener('pointercancel', handlePointerCancel);
    container.addEventListener('pointerleave', handlePointerCancel);

    return () => {
      container.style.touchAction = prevTouchAction;

      if (rafId != null) window.cancelAnimationFrame(rafId);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerCancel);
      container.removeEventListener('pointerleave', handlePointerCancel);
      endGesture(false);
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

  // NOTE: we no longer pass changing [lat,lng] to MapContainer center (locked via initialCenterRef)
  const markerPoint = markerPosition ?? (currentPos.current ? [currentPos.current[0], currentPos.current[1]] : null);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#111827]">
      {/* Map layer */}
      <div className="absolute inset-0">
        <MapContainer
          ref={handleMapRef}
          center={initialCenterRef.current!}   // locked initial center
          zoom={16}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          doubleClickZoom={false}
          zoomSnap={0}
          zoomDelta={0.01}
        >
          {/* Heat tiles */}
          <DriverHeatmap />

          {/* Base tiles */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors'
          />

          {/* User marker & path */}
          {markerPoint && <Marker position={markerPoint} icon={markerIcon} />}
          {showPath && path.length > 1 && <Polyline positions={path} color="#fb923c" weight={4} />}
        </MapContainer>
      </div>

      {/* Atmospheric layers */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[24%] bg-[linear-gradient(180deg,rgba(17,24,39,0.85)_0%,rgba(17,24,39,0.25)_70%,rgba(17,24,39,0)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-[linear-gradient(180deg,rgba(17,24,39,0)_0%,rgba(17,24,39,0.55)_45%,rgba(17,24,39,0.9)_100%)]" />

      {/* --- Floating Overlays --- */}

      {/* Top HUD */}
      <div
        className="rydex-overlay pointer-events-none absolute inset-x-0 top-0 flex justify-center px-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 1rem) + 1rem)' }}
      >
        <div className="pointer-events-auto w-full max-w-xl">
          <SpeedHUD />
        </div>
      </div>

      {/* Bottom Buttons */}
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

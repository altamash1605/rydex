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

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });

export default function MapView() {
  const mapRef = useRef<LeafletMap | null>(null);
  const { currentPos, path } = useGeoTracker();
  useLeafletLayers();
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
      if (!target) {
        return;
      }

      const start = markerPositionRef.current;
      if (!start) {
        markerPositionRef.current = target;
        setMarkerPosition(target);
        return;
      }

      if (start[0] === target[0] && start[1] === target[1]) {
        return;
      }

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
    if (!target) {
      return;
    }
    animateMarker(target);
  }, [path, currentPos, animateMarker]);

  // Detect manual pan
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

  // Auto-follow
  useEffect(() => {
    const map = mapRef.current;
    const coords = currentPos.current;
    if (map && coords && isFollowing) {
      markProgrammaticMove();
      map.setView([coords[0], coords[1]], map.getZoom(), { animate: true });
    }
  }, [path, isFollowing, currentPos]);

  const handleRecenter = () => {
    const map = mapRef.current;
    const coords = currentPos.current;
    if (!map || !coords) return;
    markProgrammaticMove();
    setIsFollowing(true);
    map.setView([coords[0], coords[1]], map.getZoom(), { animate: true });
  };

  const handleTogglePath = () => {
    setShowPath(prev => !prev);
  };

  useEffect(() => {
    if (!mapReady) {
      return;
    }
    const map = mapRef.current;
    const coords = currentPos.current;
    if (!map || !coords || hasAutoCentered.current) {
      return;
    }
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

  useEffect(() => {
    if (!mapReady) {
      return;
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

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

    // NEW: prevent page scroll/zoom fighting this gesture
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

    const sensitivity = 200;
    const minZoom = map.getMinZoom();
    const maxZoom = map.getMaxZoom();

    // keep preview visible & commit in small steps
    const PREVIEW_MIN = 0.6;
    const PREVIEW_MAX = 2.0;
    const COMMIT_STEP = 0.20;

    // accumulators for smooth zoom
    let zoomAccumulator = 0;
    let lastYDuringGesture = 0;

    // NEW: double-tap detection window & spatial tolerance + single-finger guard
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
      if (!gestureActive) {
        return;
      }

      gestureActive = false;

      if (pointerId != null && container.releasePointerCapture) {
        try {
          container.releasePointerCapture(pointerId);
        } catch {
          // ignore capture release failures
        }
      }
      pointerId = null;

      if (draggingDisabledForGesture && map.dragging && !map.dragging.enabled()) {
        map.dragging.enable();
      }
      draggingDisabledForGesture = false;

      if (!commit) {
        // Cancel path
        animateBackToIdentity(false);
        anchorPoint = null;
        anchorLatLng = null;
        lastScale = 1;
        movedDuringGesture = false;
        startZoom = map.getZoom();
        zoomAccumulator = 0;
        return;
      }

      // Commit path
      const targetZoom = Math.max(
        minZoom,
        Math.min(maxZoom, startZoom + zoomAccumulator),
      );

      animateBackToIdentity(true);

      const focusLatLng = anchorLatLng;
      window.requestAnimationFrame(() => {
        if (focusLatLng) {
          map.setZoomAround(focusLatLng, targetZoom, { animate: true });
        } else {
          map.setZoom(targetZoom, { animate: true });
        }
      });

      // Reset gesture state
      anchorPoint = null;
      anchorLatLng = null;
      lastScale = 1;
      movedDuringGesture = false;
      startZoom = map.getZoom();
      zoomAccumulator = 0;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') activeTouchCount++;
      if (event.pointerType !== 'touch') {
        return; // do NOT modify lastTapTime for mouse/stylus
      }

      const now = performance.now();
      const rect = container.getBoundingClientRect();
      const thisTapPoint = L.point(event.clientX - rect.left, event.clientY - rect.top);

      const delta = now - lastTapTime;
      const inTimeWindow = delta >= TAP_MIN_MS && delta <= TAP_MAX_MS;
      const inSpatialWindow = lastTapPoint
        ? lastTapPoint.distanceTo(thisTapPoint) <= TAP_MOVE_TOL
        : false;

      if (activeTouchCount === 1 && inTimeWindow && inSpatialWindow) {
        // Start the special gesture
        pointerId = event.pointerId;
        anchorPoint = thisTapPoint;
        anchorLatLng = map.containerPointToLatLng(anchorPoint);
        startY = event.clientY;
        startZoom = map.getZoom();
        lastScale = 1;
        movedDuringGesture = false;
        gestureActive = true;

        // ensure preview scales around the exact touch pixel
        mapPane.style.transformOrigin = `${anchorPoint.x}px ${anchorPoint.y}px`;

        // init smooth-zoom accumulators
        lastYDuringGesture = event.clientY;
        zoomAccumulator = 0;

        if (map.dragging && map.dragging.enabled()) {
          map.dragging.disable();
          draggingDisabledForGesture = true;
        } else {
          draggingDisabledForGesture = false;
        }

        if (container.setPointerCapture) {
          try {
            container.setPointerCapture(event.pointerId);
          } catch {
            // ignore capture errors
          }
        }

        // reset the double-tap clock so a third tap doesn’t chain
        lastTapTime = 0;
        lastTapPoint = null;

        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // Otherwise: record this as potential first tap
      lastTapTime = now;
      lastTapPoint = thisTapPoint;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!gestureActive || event.pointerId !== pointerId) return;

      // down = positive (zoom in), up = negative (zoom out)
      const dy = event.clientY - lastYDuringGesture;
      lastYDuringGesture = event.clientY;

      // convert to fractional zoom levels
      const dz = dy / sensitivity; // 240px ≈ 1 zoom level
      zoomAccumulator += dz;

      if (!movedDuringGesture && Math.abs(zoomAccumulator) > 0.01) {
        movedDuringGesture = true;
      }

      // visual preview: keep small so map never vanishes
      const previewScale = Math.pow(2, zoomAccumulator);
      const safePreview = Math.max(PREVIEW_MIN, Math.min(PREVIEW_MAX, previewScale));
      lastScale = safePreview;
      applyVisualScale(safePreview);

      // continuously commit small real zoom steps, pinned to the touch anchor
      while (Math.abs(zoomAccumulator) >= COMMIT_STEP) {
        const step = Math.sign(zoomAccumulator) * COMMIT_STEP;
        const nextZoom = Math.max(minZoom, Math.min(maxZoom, startZoom + step));

        if (anchorLatLng) {
          map.setZoomAround(anchorLatLng, nextZoom, { animate: false });
        } else {
          map.setZoom(nextZoom, { animate: false });
        }

        // reset baseline so preview stays tiny and stable
        startZoom = map.getZoom();
        zoomAccumulator -= step;

        const rescaled = Math.pow(2, zoomAccumulator);
        applyVisualScale(Math.max(PREVIEW_MIN, Math.min(PREVIEW_MAX, rescaled)));
      }

      event.preventDefault();
      event.stopPropagation();
    };

    const finishGesture = (event: PointerEvent) => {
      if (!gestureActive || (pointerId != null && event.pointerId !== pointerId)) {
        return;
      }

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
      if (!gestureActive || (pointerId != null && event.pointerId !== pointerId)) {
        return;
      }
      endGesture(false);
      lastTapTime = 0;
    };

    container.addEventListener('pointerdown', handlePointerDown, { passive: false });
    container.addEventListener('pointermove', handlePointerMove, { passive: false });
    container.addEventListener('pointerup', handlePointerUp, { passive: false });
    container.addEventListener('pointercancel', handlePointerCancel);
    container.addEventListener('pointerleave', handlePointerCancel);

    return () => {
      // restore touch-action
      container.style.touchAction = prevTouchAction;

      cancelAnimation();
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

  const lat = currentPos.current?.[0] ?? 0;
  const lng = currentPos.current?.[1] ?? 0;
  const markerPoint = markerPosition ?? (currentPos.current ? [lat, lng] : null);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#111827]">
      {/* Map layer */}
      <div className="absolute inset-0">
        <MapContainer
          ref={handleMapRef}
          center={[lat, lng]}
          zoom={16}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          doubleClickZoom={false}
          zoomSnap={0}
          zoomDelta={0.01}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors'
          />
          {markerPoint && <Marker position={markerPoint} icon={markerIcon}></Marker>}
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

      {/* Bottom Button */}
      <div
        className="rydex-overlay rydex-overlay-bottom pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 sm:px-6"
        style={{ paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 14px) + clamp(1rem, 3.5vw, 1.6rem))' }}
      >
        <div className="pointer-events-auto relative w-full max-w-sm">
          <div className="absolute -top-28 right-2 flex flex-col items-end gap-3">
            <PathToggleButton isActive={showPath} onToggle={handleTogglePath} />
            <RecenterButton onRecenter={handleRecenter} isFollowing={isFollowing} />
          </div>
          <ButtonBar />
        </div>
      </div>
    </div>
  );
}

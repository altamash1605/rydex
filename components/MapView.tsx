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

    const container = map.getContainer();
    let lastTapTime = 0;
    let gestureActive = false;
    let initialY = 0;
    let initialZoom = map.getZoom();
    let draggingDisabledForGesture = false;
    const sensitivity = 120;

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        if (gestureActive && draggingDisabledForGesture && map.dragging && !map.dragging.enabled()) {
          map.dragging.enable();
        }
        gestureActive = false;
        draggingDisabledForGesture = false;
        return;
      }

      const now = Date.now();
      if (now - lastTapTime < 300) {
        gestureActive = true;
        initialY = event.touches[0].clientY;
        initialZoom = map.getZoom();
        if (map.dragging && map.dragging.enabled()) {
          map.dragging.disable();
          draggingDisabledForGesture = true;
        } else {
          draggingDisabledForGesture = false;
        }
        event.preventDefault();
      } else {
        gestureActive = false;
        if (draggingDisabledForGesture && map.dragging && !map.dragging.enabled()) {
          map.dragging.enable();
        }
        draggingDisabledForGesture = false;
      }
      lastTapTime = now;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!gestureActive || event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      const deltaY = initialY - touch.clientY;
      const zoomDelta = deltaY / sensitivity;
      const targetZoom = initialZoom + zoomDelta;
      const minZoom = map.getMinZoom();
      const maxZoom = map.getMaxZoom();
      const newZoom = Math.max(minZoom, Math.min(maxZoom, targetZoom));
      if (!Number.isNaN(newZoom)) {
        map.setZoom(newZoom, { animate: false });
      }
      event.preventDefault();
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!gestureActive) {
        return;
      }
      gestureActive = false;
      if (draggingDisabledForGesture && map.dragging && !map.dragging.enabled()) {
        map.dragging.enable();
      }
      draggingDisabledForGesture = false;
      event.preventDefault();
    };

    const handleTouchCancel = () => {
      if (!gestureActive) {
        return;
      }
      gestureActive = false;
      if (draggingDisabledForGesture && map.dragging && !map.dragging.enabled()) {
        map.dragging.enable();
      }
      draggingDisabledForGesture = false;
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchCancel);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchCancel);
      if (draggingDisabledForGesture && map.dragging && !map.dragging.enabled()) {
        map.dragging.enable();
      }
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
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors'
          />
          {currentPos.current && (
            <Marker position={[lat, lng]} icon={markerIcon}></Marker>
          )}
          {showPath && path.length > 1 && <Polyline positions={path} color="#fb923c" weight={4} />}
        </MapContainer>
      </div>

      {/* Atmospheric layers */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[30%] bg-[linear-gradient(180deg,rgba(17,24,39,0.85)_0%,rgba(17,24,39,0.25)_70%,rgba(17,24,39,0)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-[linear-gradient(180deg,rgba(17,24,39,0)_0%,rgba(17,24,39,0.55)_45%,rgba(17,24,39,0.9)_100%)]" />

      {/* --- Floating Overlays --- */}

      {/* Top HUD */}
      <div
        className="rydex-overlay pointer-events-none absolute inset-x-0 top-0 flex justify-center px-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 1.5rem) + 1.5rem)' }}
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

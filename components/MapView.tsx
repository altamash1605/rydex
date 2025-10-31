'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import RecenterButton from '@/components/RecenterButton';

// ---- dynamic leaflet pieces ----
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer   = dynamic(() => import('react-leaflet').then(m => m.TileLayer),   { ssr: false });
const Polyline    = dynamic(() => import('react-leaflet').then(m => m.Polyline),    { ssr: false });
const Circle      = dynamic(() => import('react-leaflet').then(m => m.Circle),      { ssr: false });
const MapRefBinder = dynamic(() =>
  import('react-leaflet').then(m => ({
    default: function MapRefBinder({ onReady }: { onReady:(map:LeafletMap)=>void }) {
      const map = m.useMapEvents({});
      useEffect(()=>{ if(map) onReady(map); return undefined; },[map,onReady]);
      return null;
    }
  }))
);

// ---- helpers ----
function haversineM(a:[number,number],b:[number,number]){
  const R=6371000, toRad=(d:number)=>(d*Math.PI)/180;
  const dLat=toRad(b[0]-a[0]), dLng=toRad(b[1]-a[1]);
  const lat1=toRad(a[0]), lat2=toRad(b[0]);
  const s=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}

export default function MapView(){
  const [hasMounted,setHasMounted]=useState(false);
  const [path,setPath]=useState<[number,number][]>([]);
  const [isUserPanned,setIsUserPanned]=useState(false);

  const mapRef=useRef<LeafletMap|null>(null);
  const followMarkerRef=useRef(true);

  // animation state
  const animStart=useRef<number>(0);
  const prevFix=useRef<[number,number]|null>(null);
  const nextFix=useRef<[number,number]|null>(null);
  const currentPos=useRef<[number,number]|null>(null);

  // ---- map ready ----
  const handleMapReady=(map:LeafletMap)=>{
    mapRef.current=map;
  };

  // ---- GPS watch ----
  useEffect(()=>{
    if(!hasMounted||typeof navigator==='undefined') return undefined;

    import('leaflet-defaulticon-compatibility').then(()=>import('leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css'));

    const watch=navigator.geolocation.watchPosition(
      pos=>{
        const coords:[number,number]=[pos.coords.latitude,pos.coords.longitude];
        const now=Date.now();

        // push to path (true GPS)
        setPath(p=>[...p,coords]);

        // shift animation window
        prevFix.current = nextFix.current ?? coords;
        nextFix.current = coords;
        animStart.current = now;

        if(followMarkerRef.current&&mapRef.current&&!isUserPanned){
          mapRef.current.setView(coords,mapRef.current.getZoom(),{animate:true});
        }
      },
      err=>console.error(err),
      {enableHighAccuracy:true,timeout:15000,maximumAge:0}
    );

    return()=>navigator.geolocation.clearWatch(watch);
  },[hasMounted,isUserPanned]);

  // ---- animate blue dot between true fixes ----
  useEffect(()=>{
    if(!hasMounted) return undefined;
    let raf:number;
    const DURATION=1000; // assume GPS about 1 Hz

    const loop=()=>{
      const a=prevFix.current,b=nextFix.current;
      if(a&&b){
        const t=Math.min((Date.now()-animStart.current)/DURATION,1);
        const lat=a[0]+(b[0]-a[0])*t;
        const lng=a[1]+(b[1]-a[1])*t;
        currentPos.current=[lat,lng];
      }else if(b){
        currentPos.current=b;
      }
      raf=requestAnimationFrame(loop);
    };
    raf=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(raf);
  },[hasMounted]);

  // ---- mount ----
  useEffect(()=>{ setHasMounted(true); },[]);

  // ---- manual pan detection ----
  useEffect(():void|(()=>void)=>{
    if(!hasMounted) return undefined;
    const map=mapRef.current;
    if(!map) return undefined;
    const stopFollow=()=>{
      followMarkerRef.current=false;
      setIsUserPanned(true);
    };
    map.on('dragstart',stopFollow);
    return()=>map.off('dragstart',stopFollow);
  },[hasMounted]);

  if(!hasMounted)
    return(
      <div className="flex items-center justify-center h-full w-full bg-gray-100">
        <p className="text-gray-600">Fetching location...</p>
      </div>
    );

  const center=currentPos.current??path[path.length-1]??[0,0];

  // ---- render ----
  return(
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <MapContainer
          center={center as [number,number]}
          zoom={15}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
          doubleClickZoom
          scrollWheelZoom
          dragging
        >
          <MapRefBinder onReady={handleMapReady}/>
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          {path.length>1 && (
            <Polyline positions={path} pathOptions={{color:'#007bff',weight:4,opacity:0.9}}/>
          )}
          {/* solid blue dot following real path */}
          {currentPos.current && (
            <Circle
              center={currentPos.current}
              radius={6}
              pathOptions={{
                color:'#007bff',
                fillColor:'#007bff',
                fillOpacity:0.9,
                weight:0
              }}
            />
          )}
        </MapContainer>
      </div>
      <RecenterButton visible={true}/>
    </div>
  );
}

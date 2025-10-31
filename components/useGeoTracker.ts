import { useEffect, useRef, useState } from 'react';

// --- helper ---
function haversineM(a:[number,number],b:[number,number]){
  const R=6371000,toRad=(d:number)=>(d*Math.PI)/180;
  const dLat=toRad(b[0]-a[0]),dLng=toRad(b[1]-a[1]);
  const lat1=toRad(a[0]),lat2=toRad(b[0]);
  const s=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}

// --- simple Kalman smoother (unchanged) ---
class SimpleKalman{
  pos:[number,number];
  vel:[number,number];
  processNoise=0.00005;
  measureNoise=0.001;
  constructor(lat:number,lng:number){ this.pos=[lat,lng]; this.vel=[0,0]; }
  update(lat:number,lng:number,dt:number){
    this.pos[0]+=this.vel[0]*dt;
    this.pos[1]+=this.vel[1]*dt;
    const k=this.processNoise/(this.processNoise+this.measureNoise);
    const newVel:[number,number]=[(lat-this.pos[0])/dt,(lng-this.pos[1])/dt];
    this.vel[0]=this.vel[0]*(1-k)+newVel[0]*k;
    this.vel[1]=this.vel[1]*(1-k)+newVel[1]*k;
    this.pos[0]+=k*(lat-this.pos[0]);
    this.pos[1]+=k*(lng-this.pos[1]);
  }
  predict(dt:number){
    return [this.pos[0]+this.vel[0]*dt,this.pos[1]+this.vel[1]*dt] as [number,number];
  }
}

// --- Hook ---
export function useGeoTracker(){
  const [path,setPath]=useState<[number,number][]>([]);
  const kalmanRef=useRef<SimpleKalman|null>(null);
  const lastFixTime=useRef<number|null>(null);
  const lastFix=useRef<[number,number]|null>(null);
  const currentPos=useRef<[number,number]|null>(null);
  const smoothedSpeed=useRef(0); // computed m/s

  // thresholds
  const SPEED_THRESHOLD = 0.5; // m/s
  const DIST_THRESHOLD  = 2;   // m

  useEffect(()=>{
    if(typeof navigator==='undefined') return;
    const watch=navigator.geolocation.watchPosition(
      pos=>{
        const coords:[number,number]=[pos.coords.latitude,pos.coords.longitude];
        const now=Date.now();

        // --- compute dt and distance since last fix ---
        const dt=(lastFixTime.current ? (now - lastFixTime.current)/1000 : 1);
        const dist=(lastFix.current ? haversineM(lastFix.current, coords) : 0);

        // --- compute our own speed (m/s) ---
        const rawSpeed = dist/dt;
        // exponential smoothing for stability
        smoothedSpeed.current = smoothedSpeed.current*0.7 + rawSpeed*0.3;

        lastFix.current = coords;
        lastFixTime.current = now;

        if(!kalmanRef.current){
          kalmanRef.current=new SimpleKalman(coords[0],coords[1]);
          currentPos.current=coords;
          setPath([coords]);
          return;
        }

        kalmanRef.current.update(coords[0],coords[1],dt);

        // ✅ Only extend path if moving enough
        if (smoothedSpeed.current > SPEED_THRESHOLD && dist > DIST_THRESHOLD) {
          setPath(p => [...p, coords]);
        }

        currentPos.current=coords;
      },
      err=>console.error(err),
      {enableHighAccuracy:true,timeout:15000,maximumAge:0}
    );
    return()=>navigator.geolocation.clearWatch(watch);
  },[]);

  // prediction + lag
  useEffect(()=>{
    let raf:number;
    const LAG=500;
    const loop=()=>{
      const kf=kalmanRef.current;
      if(kf&&lastFixTime.current){
        const dt=(Date.now()-(lastFixTime.current+LAG))/1000;
        currentPos.current=kf.predict(dt);
      }
      raf=requestAnimationFrame(loop);
    };
    raf=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(raf);
  },[]);

  return { path, currentPos };
}

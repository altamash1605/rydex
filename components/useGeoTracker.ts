import { useEffect, useRef, useState } from 'react';

// --- helper ---
function haversineM(a:[number,number],b:[number,number]){
  const R=6371000,toRad=(d:number)=>(d*Math.PI)/180;
  const dLat=toRad(b[0]-a[0]),dLng=toRad(b[1]-a[1]);
  const lat1=toRad(a[0]),lat2=toRad(b[0]);
  const s=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}

// --- Kalman-like smoother with stop damping ---
class SimpleKalman{
  pos:[number,number];
  vel:[number,number];
  processNoise:number;
  measureNoise:number;

  constructor(lat:number,lng:number){
    this.pos=[lat,lng];
    this.vel=[0,0];
    this.processNoise=0.00005;
    this.measureNoise=0.001;
  }

  // ✅ Updated update() with stop detection
  update(lat:number,lng:number,dt:number,speed?:number){
    // predict
    this.pos[0]+=this.vel[0]*dt;
    this.pos[1]+=this.vel[1]*dt;

    const k=this.processNoise/(this.processNoise+this.measureNoise);

    // detect low speed (<0.5 m/s)
    const lowSpeed = speed !== undefined && speed < 0.5;

    // compute new velocity (or zero if stopped)
    const newVel:[number,number]=lowSpeed
      ? [0,0]
      : [(lat-this.pos[0])/dt,(lng-this.pos[1])/dt];

    // blend velocity
    this.vel[0]=this.vel[0]*(1-k)+newVel[0]*k;
    this.vel[1]=this.vel[1]*(1-k)+newVel[1]*k;

    // correct position
    this.pos[0]+=k*(lat-this.pos[0]);
    this.pos[1]+=k*(lng-this.pos[1]);

    // freeze position if nearly stopped
    if(lowSpeed){
      this.vel=[0,0];
    }
  }

  // ✅ Clamp prediction when velocity ≈ 0
  predict(dt:number){
    if(Math.abs(this.vel[0])<1e-6 && Math.abs(this.vel[1])<1e-6){
      return this.pos;
    }
    return [
      this.pos[0]+this.vel[0]*dt,
      this.pos[1]+this.vel[1]*dt
    ] as [number,number];
  }
}

// --- Hook ---
export function useGeoTracker(){
  const [path,setPath]=useState<[number,number][]>([]);
  const kalmanRef=useRef<SimpleKalman|null>(null);
  const lastFixTime=useRef<number|null>(null);
  const currentPos=useRef<[number,number]|null>(null);

  useEffect(()=>{
    if(typeof navigator==='undefined') return;
    const watch=navigator.geolocation.watchPosition(
      pos=>{
        const coords:[number,number]=[pos.coords.latitude,pos.coords.longitude];
        const now=Date.now();
        const speed = pos.coords.speed ?? 0; // ✅ get raw GPS speed if available

        if(!kalmanRef.current){
          kalmanRef.current=new SimpleKalman(coords[0],coords[1]);
          lastFixTime.current=now;
          currentPos.current=coords;
          setPath([coords]);
          return;
        }

        const dt=(now-(lastFixTime.current??now))/1000;
        lastFixTime.current=now;

        // ✅ update with speed info
        kalmanRef.current.update(coords[0],coords[1],dt,speed);

        // store the true GPS path (for 90° turns, etc.)
        setPath(p=>[...p,coords]);
      },
      err=>console.error(err),
      {enableHighAccuracy:true,timeout:15000,maximumAge:0}
    );

    return()=>navigator.geolocation.clearWatch(watch);
  },[]);

  // prediction + lag rendering
  useEffect(()=>{
    let raf:number;
    const LAG=500; // ms lag for smoother interpolation
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

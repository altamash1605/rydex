import { useEffect, useRef, useState } from 'react';

function haversineM(a:[number,number],b:[number,number]){
  const R=6371000,toRad=(d:number)=>(d*Math.PI)/180;
  const dLat=toRad(b[0]-a[0]),dLng=toRad(b[1]-a[1]);
  const lat1=toRad(a[0]),lat2=toRad(b[0]);
  const s=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}

class SimpleKalman{
  pos:[number,number]; vel:[number,number];
  processNoise=0.00005; measureNoise=0.001;
  constructor(lat:number,lng:number){ this.pos=[lat,lng]; this.vel=[0,0]; }
  update(lat:number,lng:number,dt:number){
    this.pos[0]+=this.vel[0]*dt; this.pos[1]+=this.vel[1]*dt;
    const k=this.processNoise/(this.processNoise+this.measureNoise);
    const newVel:[number,number]=[(lat-this.pos[0])/dt,(lng-this.pos[1])/dt];
    this.vel[0]=this.vel[0]*(1-k)+newVel[0]*k;
    this.vel[1]=this.vel[1]*(1-k)+newVel[1]*k;
    this.pos[0]+=k*(lat-this.pos[0]);
    this.pos[1]+=k*(lng-this.pos[1]);
  }
  predict(dt:number){ return [this.pos[0]+this.vel[0]*dt,this.pos[1]+this.vel[1]*dt] as [number,number]; }
}

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
        if(!kalmanRef.current){
          kalmanRef.current=new SimpleKalman(coords[0],coords[1]);
          lastFixTime.current=now;
          currentPos.current=coords;
          setPath([coords]);
          return;
        }
        const dt=(now-(lastFixTime.current??now))/1000;
        lastFixTime.current=now;
        kalmanRef.current.update(coords[0],coords[1],dt);
        setPath(p=>[...p,coords]);
      },
      err=>console.error(err),
      {enableHighAccuracy:true,timeout:15000,maximumAge:0}
    );
    return()=>navigator.geolocation.clearWatch(watch);
  },[]);

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

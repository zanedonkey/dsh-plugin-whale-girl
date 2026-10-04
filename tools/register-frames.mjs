// Measure original RGBA atlases without changing or resampling their pixels.
// Each pose uses its shoes as the origin, rather than the cell or whale tail.
import fs from 'node:fs';
import { decodeRGBA, faceLandmark } from './png-landmarks.mjs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const active = JSON.parse(fs.readFileSync(`${root}/assets/active-atlases.json`, 'utf8'));
const grid=(tops,heights)=>Array.from({length:16},(_,i)=>[i%4*313.5+8,tops[Math.floor(i/4)],305.5,heights[Math.floor(i/4)]]);
const sets={
  resting:{file:active.idle,size:330,masks:grid([0,316,632,943],[316,316,311,311])},
  eating:{file:active.eating,size:323,masks:grid([0,316,631,942],[316,315,311,312])},
  transition:{file:active.transition,size:330,masks:grid([0,328,626,928],[328,298,302,326])},
  actions:{file:active.actions,size:330,masks:grid([0,320,632,945],[320,312,313,309])},
  expressions:{file:active.expressions,size:330,masks:grid([0,324,638,940],[324,314,302,314])},
  working:{file:'whale-girl-animation.png',size:300,masks:[33,339,652,960].map(x=>[x,345,290,290])},
  headpat:{file:'whale-girl-animation.png',size:300,masks:[33,339,652,960].map(x=>[x,645,290,290])},
  static:{file:'whale-girl-atlas.png',size:660,masks:[[0,0,432,648],[437,0,399,648],[850,0,404,648],[0,648,432,606],[437,648,399,606],[850,648,404,606]]},
};
const result={},report={anchor:[0.46,0.965],sets:{}};
for(const [name,set] of Object.entries(sets)) {
  const image=decodeRGBA(new URL(`../assets/${set.file}`, import.meta.url)); result[name]=[]; report.sets[name]=[];
  for(const [index,mask] of set.masks.entries()) {
    const [mx,my,mw,mh]=mask;
    const sx=Math.ceil(mx),sy=Math.ceil(my),ex=Math.min(image.w,Math.ceil(mx+mw)),ey=Math.min(image.h,Math.ceil(my+mh));
    const cw=ex-sx,ch=ey-sy,visited=new Uint8Array(cw*ch);let silhouette=[];
    // Ignore disconnected scraps from adjacent cells or alpha speckles.
    for(let i=0;i<visited.length;i++) {
      if(visited[i]||!image.opaque(sx+i%cw,sy+Math.floor(i/cw)))continue;
      const component=[i];visited[i]=1;
      for(let q=0;q<component.length;q++) {
        const p=component[q],x=p%cw,y=Math.floor(p/cw);
        for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx=x+dx,ny=y+dy,n=ny*cw+nx;
          if(nx<0||nx>=cw||ny<0||ny>=ch||visited[n]||!image.opaque(sx+nx,sy+ny))continue;
          visited[n]=1;component.push(n);
        }
      }
      if(component.length>silhouette.length)silhouette=component;
    }
    const body=new Set(silhouette);
    const belongs=(x,y)=>x>=sx&&x<ex&&y>=sy&&y<ey&&body.has((y-sy)*cw+x-sx);
    // A central foot-only band excludes the large asymmetric whale tail.
    const staticFeet=[[140,255],[550,680],[990,1110],[140,280],[550,680],[930,1040]];
    const left=name==='static'?staticFeet[index][0]:Math.ceil(mx+mw*.26);
    const right=name==='static'?staticFeet[index][1]:Math.floor(mx+mw*.63);
    let bottom;
    for(let y=Math.min(image.h-1,Math.ceil(my+mh)-1);y>=my+mh*.7;y--) {
      let count=0;for(let x=left;x<=right;x++)if(belongs(x,y))count++;
      if(count>=5){bottom=y+1;break;}
    }
    if(!bottom)throw Error(`No shoes found: ${name} ${index}`);
    let min=Infinity,max=-Infinity;
    for(let y=bottom-Math.round(mh*.025);y<bottom;y++)for(let x=left;x<=right;x++)if(belongs(x,y)){min=Math.min(min,x);max=Math.max(max,x);}
    const shoeCenter=(min+max+1)/2;
    // Preserve the standing model's apparent size, rather than assuming every
    // independently drawn sheet has the same scale because its cell is 313.5px.
    // Frame 13 has the same hair/tail span as idle; frame 12 is visibly narrower.
    const size=name==='transition'&&index===13?333:name==='transition'&&index===10?325:set.size;
    const face=['resting','eating','transition','actions','expressions'].includes(name)?faceLandmark(image,index):undefined;
    // Keep the new standing model's neutral face on the meal's character root.
    // Apply one offset per standing atlas so glances and head tilts remain real.
    const offsets={resting:3.5,actions:3.5,expressions:2.5};
    const mealRootX=.46+.5/323;
    const center=name==='transition'?face.center-(mealRootX-.46)*size:shoeCenter+(offsets[name]??0);
    const rect=[center-size*.46,bottom-size*.965,size,size];
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const p of silhouette){const x=sx+p%cw,y=sy+Math.floor(p/cw);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    const loX=Math.max(mx,minX-2),loY=Math.max(my,minY-2);
    const hiX=Math.min(mx+mw,maxX+3),hiY=Math.min(my+mh,maxY+3);
    const isolated=[loX,loY,hiX-loX,hiY-loY];
    result[name].push({rect,mask:isolated,anchor:[center,bottom]});
    report.sets[name].push({frame:index,center,shoeCenter,bottom,rect,mask:isolated,
      ...(face?{face}:{})});
  }
}
// Judge the entire visible silhouette as well as the face and ground anchor.
// Using the narrow frame 12 caused a sudden shrink despite matching face width.
report.mealCalibration={preparationFrames:[13,2,10],mealFrame:0,mealScale:323,standingScale:330};
fs.mkdirSync(`${root}/artifacts`,{recursive:true});
fs.writeFileSync(`${root}/src/registration.js`,`// Generated by tools/register-frames.mjs from original PNG alpha; images remain unchanged.\n// All clips share a fixed square canvas and shoe anchor at 46% / 96.5%.\nexport const FRAME_REGISTRATION = Object.freeze(${JSON.stringify(result,null,2)});\n`);
fs.writeFileSync(`${root}/artifacts/registration-report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.sets).map(([name,frames])=>[name,frames.map(f=>[f.center,f.bottom])])),null,2));

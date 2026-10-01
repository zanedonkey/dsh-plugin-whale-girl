// Measure original RGBA atlases without changing or resampling their pixels.
// Each pose uses its shoes as the origin, rather than the cell or whale tail.
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
function decode(file) {
  const png = fs.readFileSync(new URL(`../assets/${file}`, import.meta.url));
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0) throw Error('Expected noninterlaced 8-bit RGBA');
  const chunks = [];
  for (let p = 8; p < png.length;) { const n = png.readUInt32BE(p); if (png.toString('ascii', p+4, p+8) === 'IDAT') chunks.push(png.subarray(p+8,p+8+n)); p += n+12; }
  const raw = inflateSync(Buffer.concat(chunks)), pixels = Buffer.alloc(w*h*4), stride=w*4;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<h;y++) {
    const filter=raw[y*(stride+1)];
    for(let x=0;x<stride;x++) {
      const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;
      const prediction=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
      if(prediction===undefined)throw Error('Unknown PNG filter');
      pixels[i]=(raw[y*(stride+1)+1+x]+prediction)&255;
    }
  }
  return {w,h,pixels,opaque:(x,y)=>pixels[(y*w+x)*4+3]>=200};
}
const grid=(tops,heights)=>Array.from({length:16},(_,i)=>[i%4*313.5+8,tops[Math.floor(i/4)],305.5,heights[Math.floor(i/4)]]);
const sets={
  resting:{file:'whale-girl-idle-unified.png',size:330,masks:grid([0,316,632,943],[316,316,311,311])},
  eating:{file:'whale-girl-eating-smooth.png',size:330,masks:grid([0,316,631,942],[316,315,311,312])},
  transition:{file:'whale-girl-meal-transition-unified.png',size:330,masks:grid([0,320,638,942],[320,318,304,312])},
  actions:{file:'whale-girl-actions-050.png',size:330,masks:grid([0,312,626,938],[322,324,324,316])},
  expressions:{file:'whale-girl-expressions-050.png',size:330,masks:grid([0,312,626,938],[322,324,324,316])},
  working:{file:'whale-girl-animation.png',size:300,masks:[33,339,652,960].map(x=>[x,345,290,290])},
  headpat:{file:'whale-girl-animation.png',size:300,masks:[33,339,652,960].map(x=>[x,645,290,290])},
  static:{file:'whale-girl-atlas.png',size:660,masks:[[0,0,432,648],[437,0,399,648],[850,0,404,648],[0,648,432,606],[437,648,399,606],[850,648,404,606]]},
};
const result={},report={anchor:[0.46,0.965],sets:{}};
for(const [name,set] of Object.entries(sets)) {
  const image=decode(set.file); result[name]=[]; report.sets[name]=[];
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
    const center=(min+max+1)/2,size=set.size;
    const rect=[center-size*.46,bottom-size*.965,size,size];
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const p of silhouette){const x=sx+p%cw,y=sy+Math.floor(p/cw);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    const loX=Math.max(mx,minX-2),loY=Math.max(my,minY-2);
    const hiX=Math.min(mx+mw,maxX+3),hiY=Math.min(my+mh,maxY+3);
    const isolated=[loX,loY,hiX-loX,hiY-loY];
    result[name].push({rect,mask:isolated,anchor:[center,bottom]});
    report.sets[name].push({frame:index,center,bottom,rect,mask:isolated});
  }
}
fs.writeFileSync(`${root}/src/registration.js`,`// Generated by tools/register-frames.mjs from original PNG alpha; images remain unchanged.\n// All clips share a fixed square canvas and shoe anchor at 46% / 96.5%.\nexport const FRAME_REGISTRATION = Object.freeze(${JSON.stringify(result,null,2)});\n`);
fs.writeFileSync(`${root}/artifacts/registration-report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.sets).map(([name,frames])=>[name,frames.map(f=>[f.center,f.bottom])])),null,2));

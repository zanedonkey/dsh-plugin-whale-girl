// Read-only measurements of the original PNG; never writes or edits pixels.
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
export function decodeRGBA(file) {
  const png=fs.readFileSync(file),w=png.readUInt32BE(16),h=png.readUInt32BE(20);
  if(png[24]!==8||png[25]!==6||png[28]!==0)throw Error('Expected noninterlaced 8-bit RGBA');
  const chunks=[];
  for(let p=8;p<png.length;){const n=png.readUInt32BE(p);if(png.toString('ascii',p+4,p+8)==='IDAT')chunks.push(png.subarray(p+8,p+8+n));p+=n+12;}
  const raw=inflateSync(Buffer.concat(chunks)),pixels=Buffer.alloc(w*h*4),stride=w*4;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<h;y++)for(let x=0;x<stride;x++){
    const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;
    const prediction=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][raw[y*(stride+1)]];
    if(prediction===undefined)throw Error('Unknown PNG filter');
    pixels[i]=(raw[y*(stride+1)+1+x]+prediction)&255;
  }
  return {w,h,pixels,opaque:(x,y)=>pixels[(y*w+x)*4+3]>=200};
}
export function faceLandmark(image,frame) {
  const ox=frame%4*313.5,oy=Math.floor(frame/4)*313.5;
  const x0=Math.ceil(ox+80),y0=Math.ceil(oy+75),w=150,h=170,visited=new Uint8Array(w*h);let best=[];
  const skin=(x,y)=>{const i=(y*image.w+x)*4,[r,g,b,a]=image.pixels.subarray(i,i+4);return a>200&&r>175&&g>140&&b>115&&r>b*1.08&&r>g*1.015;};
  for(let i=0;i<visited.length;i++){
    if(visited[i]||!skin(x0+i%w,y0+Math.floor(i/w)))continue;
    const part=[i];visited[i]=1;
    for(let q=0;q<part.length;q++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=part[q]%w+dx,y=Math.floor(part[q]/w)+dy,j=y*w+x;
      if(x<0||x>=w||y<0||y>=h||visited[j]||!skin(x0+x,y0+y))continue;
      visited[j]=1;part.push(j);
    }
    if(part.length>best.length)best=part;
  }
  if(best.length<1000)throw Error(`Missing face landmark in frame ${frame}`);
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const p of best){const x=x0+p%w,y=y0+Math.floor(p/w);left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
  return {center:(left+right)/2,chin:bottom,width:right-left,bounds:[left,top,right,bottom]};
}

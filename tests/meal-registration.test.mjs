import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeRGBA,faceLandmark} from '../tools/png-landmarks.mjs';
import {ANIMATION_CLIPS,animationFrame} from '../src/animation.js';
import {MotionDirector} from '../src/motion.js';
import {FRAME_REGISTRATION} from '../src/registration.js';
const active=JSON.parse(fs.readFileSync(new URL('../assets/active-atlases.json',import.meta.url),'utf8'));
const files=Object.fromEntries(['idle','transition','eating'].map(key=>[key,active[key]]));
const images=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,decodeRGBA(new URL(`../assets/${file}`,import.meta.url))]));
function visible(pose){
  const face=faceLandmark(images[pose.assetKey],pose.sourceFrame??pose.frame);
  const [x,y,w,h]=pose.rect;
  return {x:(face.center-x)/w*330,chin:(face.chin-y)/h*330,width:face.width/w*330};
}
function poses(clip){return ANIMATION_CLIPS[clip].frames.map(frame=>ANIMATION_CLIPS[clip].poses[frame]);}
function silhouette(pose){
  const image=images[pose.assetKey],[mx,my,mw,mh]=pose.mask;
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(let y=Math.ceil(my);y<my+mh;y++)for(let x=Math.ceil(mx);x<mx+mw;x++)if(image.opaque(x,y)){
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
  }
  return {width:(right-left)/pose.rect[2]*330,height:(bottom-top)/pose.rect[3]*330};
}

test('actual whole-character silhouette does not suddenly shrink when taking the bowl or returning to idle',()=>{
  for(const clip of ['eatingDown','eatingUp']){
    const sizes=poses(clip).map(silhouette);
    for(let i=1;i<sizes.length;i++)for(const axis of ['width','height']){
      assert.ok(Math.abs(sizes[i][axis]/sizes[i-1][axis]-1)<.035,`${clip} ${i}: abrupt ${axis} change`);
    }
  }
  const idle=silhouette({...FRAME_REGISTRATION.resting[0],assetKey:'idle'});
  const oldBowl=silhouette({...FRAME_REGISTRATION.transition[12],assetKey:'transition'});
  assert.ok(1-oldBowl.width/idle.width>.035,'the rejected bowl drawing reproduces the visible shrink beyond the continuity limit');
  const firstBowl=silhouette(poses('eatingDown')[2]);
  assert.ok(Math.abs(firstBowl.width/idle.width-1)<.01,'first bowl drawing retains the idle silhouette width');
});
test('actual PNG face descends into the meal without overshooting or horizontal drift',()=>{
  const sequence=poses('eatingDown').map(visible),end=visible({...animationFrame('eating'),assetKey:'eating'});
  for(let i=0;i<sequence.length;i++){
    assert.ok(Math.abs(sequence[i].x-end.x)<3,'character root must not slide horizontally');
    assert.ok(sequence[i].chin<=end.chin+1,'squat must not sink below the meal then pop upward');
    assert.ok(Math.abs(sequence[i].width/end.width-1)<.06,'visible face size must remain consistent');
    if(i)assert.ok(sequence[i].chin>=sequence[i-1].chin-1.1,'descent must not bounce upward');
  }
});
test('preparation and recovery meet the rice drawing at identical source pixels and placement',()=>{
  const down=animationFrame('eatingDown',899),rice=animationFrame('eating',0),up=animationFrame('eatingUp',0);
  for(const handoff of [down,up]){
    assert.equal(handoff.assetKey,'eating');assert.equal(handoff.sourceFrame,0);
    assert.deepEqual(handoff.rect,rice.rect);assert.deepEqual(handoff.mask,rice.mask);
  }
  const oldFace=faceLandmark(decodeRGBA(new URL('../assets/whale-girl-meal-transition-unified.png',import.meta.url)),7),oldFloor=627;
  assert.ok((.965-(oldFloor-oldFace.chin)/330)*330-visible({...rice,assetKey:'eating'}).chin>15,'fixture contains the original visible jump');
});
test('recovery rises on the ground, retains the full silhouette and meets the actual idle pixels',()=>{
  const sequence=poses('eatingUp');let previous=Infinity;
  for(const pose of sequence){
    const face=visible(pose);assert.ok(face.chin<=previous+1.1);previous=face.chin;
    const [x,y,w,h]=pose.rect,[mx,my,mw,mh]=pose.mask;
    assert.ok(mx>=x&&my>=y&&mx+mw<=x+w&&my+mh<=y+h,'complete character must fit the fixed viewport');
  }
  const last=sequence.at(-1),idle=animationFrame('resting',2660);
  assert.equal(last.assetKey,'idle');assert.equal(last.sourceFrame,3);assert.deepEqual(last.rect,idle.rect);
});
test('clicking during any of sixteen idle poses preserves that exact visible drawing first',()=>{
  let elapsed=0;
  for(const duration of ANIMATION_CLIPS.resting.durations){
    const d=new MotionDirector();d.sample('resting',0);const before=d.sample('resting',elapsed);
    const after=d.sample('eating',elapsed+1);assert.deepEqual(after.rect,before.rect);assert.equal(after.assetKey,before.assetKey);assert.equal(after.frame,before.frame);
    elapsed+=duration;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionDirector, MOTION_ACTIONS, actionPose, transitionRoute } from '../src/motion.js';
import { EATING_TIMING } from '../src/animation.js';

function grounded(pose) {
  const [x,y,w,h]=pose.rect,[cx,floor]=pose.anchor;
  assert.equal(w,h); assert.equal(w,330);
  assert.ok(Math.abs((cx-x)/w-.46)<1e-10); assert.ok(Math.abs((floor-y)/h-.965)<1e-10);
  assert.ok(['idle','actions','expressions','eating','transition'].includes(pose.assetKey));
}
for(const from of MOTION_ACTIONS) for(const to of MOTION_ACTIONS) if(from!==to) {
  test(`${from} -> ${to} uses the visible cel, grounded intermediate poses and reaches its destination`,()=>{
    const director=new MotionDirector(); director.sample(from,1000); const visible=director.sample(from,2600);
    const first=director.sample(to,2601),end=first.phaseStarted;
    if(first.transitioning) { assert.deepEqual(first.rect,visible.rect); assert.equal(first.assetKey,visible.assetKey); }
    for(let now=2601;now<=end;now+=17)grounded(director.sample(to,now));
    const final=director.sample(to,end);
    assert.equal(final.transitioning,false);assert.equal(final.target,to);grounded(final);
    if(to==='resting'){ assert.equal(final.frame,3); assert.equal(director.sample(to,end+80).frame,4); }
    assert.ok(end-2601<=850,'routes must not add a long pause');
  });
}
test('rapid reversals retract only the movement already shown and do not queue stale targets',()=>{
  const d=new MotionDirector();d.sample('resting',0);d.sample('working',1);
  const partial=d.sample('working',100);assert.equal(partial.depth,1);
  const reverse=d.sample('waiting',101);assert.deepEqual(reverse.rect,partial.rect);
  assert.ok(!d.route.some(s=>s.pose.branch==='working'&&s.pose.depth>partial.depth));
  d.sample('waiting',200);const p=d.lastPose;const interrupt=d.sample('error',201);
  assert.deepEqual(interrupt.rect,p.rect);assert.equal(interrupt.target,'error');
  const end=d.phaseStarted;assert.equal(d.sample('error',end).branch,'error');
});
test('all interruption points of an entry or exit can safely retarget to every action',()=>{
  for(const source of MOTION_ACTIONS)for(const destination of MOTION_ACTIONS)if(source!==destination)for(const offset of [0,31,100,200,350])for(const urgent of MOTION_ACTIONS){
    const d=new MotionDirector();d.sample(source,0);d.sample(source,1500);d.sample(destination,1501);
    const visible=d.sample(destination,1501+offset);const redirected=d.sample(urgent,1502+offset);
    if(urgent!==destination&&redirected.transitioning){assert.equal(redirected.assetKey,visible.assetKey);assert.deepEqual(redirected.rect,visible.rect);}
    grounded(redirected);const done=d.sample(urgent,Math.max(1502+offset,d.phaseStarted));assert.equal(done.target,urgent);grounded(done);
  }
});
test('interrupted eating puts away its bowl; normal completion immediately continues idle',()=>{
  const d=new MotionDirector();d.sample('eating',0);const eating=d.sample('eating',1500);
  const route=transitionRoute(eating,'working');
  assert.ok(route.some(s=>s.pose.assetKey==='transition'&&s.pose.clip==='eatingUp'));
  const firstComputer=route.findIndex(s=>s.pose.branch==='working');
  assert.ok(firstComputer>route.findIndex(s=>s.pose.branch==='resting'));
  const natural=new MotionDirector();natural.sample('eating',0);natural.sample('eating',EATING_TIMING.total-1);
  const idle=natural.sample('resting',EATING_TIMING.total,false,EATING_TIMING.total);
  assert.equal(idle.transitioning,false);assert.equal(idle.frame,3);assert.equal(natural.sample('resting',EATING_TIMING.total+80).frame,4);
});
test('pause cancels pending movement; unchanged targets preserve phase and static endpoints stop refresh',()=>{
  const d=new MotionDirector();d.sample('resting',0);d.sample('sleeping',1);assert.ok(d.route.length);
  const still=d.sample('sleeping',80,true);assert.equal(still.transitioning,false);assert.equal(still.needsFrame,false);assert.equal(d.route.length,0);
  const end=d.sample('sleeping',200);assert.equal(end.needsFrame,false);
  d.sample('working',201);const started=d.phaseStarted;d.sample('working',220);assert.equal(d.phaseStarted,started);
  for(const action of ['waiting','error','sleeping'])assert.equal(actionPose(action).needsFrame,false);
});

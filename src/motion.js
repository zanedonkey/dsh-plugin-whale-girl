import { FRAME_REGISTRATION } from './registration.js';
import { animationFrame, eatingStage, RESTING_AFTER_MEAL_PHASE, ANIMATION_CLIPS } from './animation.js';

export const MOTION_ACTIONS = Object.freeze(['resting', 'working', 'headpat', 'eating', 'waiting', 'celebrate', 'error', 'sleeping']);
const BRANCHES = Object.freeze({
  working: ['actions', 0], headpat: ['actions', 4], waiting: ['actions', 8], celebrate: ['actions', 12],
  error: ['expressions', 0], sleeping: ['expressions', 4],
});
function cel(assetKey, frame, branch, depth, clip = branch, recoveryFrom) {
  return { ...FRAME_REGISTRATION[assetKey === 'idle' ? 'resting' : assetKey][frame], assetKey, frame, branch, depth, clip, recoveryFrom };
}
const neutral = () => cel('idle', 3, 'resting', 0);
function branchCel(action, depth) {
  if (depth === 0) return neutral();
  const [asset, offset] = BRANCHES[action];
  return cel(asset, offset + depth, action, depth);
}
function loopStep(sequence, durations, elapsed, paused) {
  const cycle = durations.reduce((sum, duration) => sum + duration, 0);
  let phase = paused ? 0 : Math.max(0, elapsed) % cycle;
  let i = 0; while (i < sequence.length - 1 && phase >= durations[i]) phase -= durations[i++];
  return sequence[i];
}
export function actionPose(action, elapsed = 0, paused = false) {
  if (action === 'resting') {
    const sample = animationFrame('resting', elapsed, paused);
    return { ...sample, assetKey: 'idle', branch: action, depth: 0, clip: action, needsFrame: true };
  }
  if (action === 'eating') {
    const stage = eatingStage(elapsed, paused), sample = animationFrame(stage.clip, stage.elapsed, paused);
    const recoveryFrom = stage.clip === 'eatingUp' ? sample.frame - 8 + 1
      : stage.clip === 'eatingDown' && sample.frame <= 1 ? 8
      : stage.clip === 'eatingDown' && sample.frame === 2 ? 3
      : stage.clip === 'eatingDown' && sample.frame === 3 ? 2
      : stage.clip === 'eatingDown' && sample.frame === 4 ? 1 : 0;
    return { ...sample, assetKey: sample.assetKey || (stage.clip === 'eating' ? 'eating' : 'transition'), branch: recoveryFrom >= 8 ? 'resting' : action,
      depth: recoveryFrom >= 8 ? 0 : 3, recoveryFrom, clip: stage.clip, needsFrame: true };
  }
  if (action === 'working' || action === 'headpat') {
    const index = loopStep([0,1,2,3,2,1], action === 'working' ? [200,160,180,140,180,160] : [220,220,240,240,240,220], elapsed, paused);
    return { ...cel('expressions', (action === 'working' ? 8 : 12) + index, action, 3), needsFrame: true };
  }
  if (action === 'celebrate') {
    const depth = loopStep([3,2,3], [380,160,420], elapsed, paused);
    return { ...branchCel(action, depth), needsFrame: true };
  }
  return { ...branchCel(action, 3), needsFrame: false };
}
function exitsFrom(pose) {
  if (!pose) return [];
  if (pose.branch === 'eating') {
    const steps = [];
    for (let i = pose.recoveryFrom ?? 0; i < 8; i++) steps.push({ pose: { ...ANIMATION_CLIPS.eatingUp.poses[8+i],frame:8+i,branch:i===7?'resting':'eating',depth:i===7?0:3,clip:'eatingUp',recoveryFrom:i+1 }, duration: i === 7 ? 50 : 55 });
    return steps;
  }
  if (!BRANCHES[pose.branch]) return [];
  const steps = [];
  for (let depth=pose.depth-1;depth>0;depth--) steps.push({ pose: branchCel(pose.branch, depth), duration: pose.branch === 'sleeping' ? 100 : 65 });
  steps.push({ pose: neutral(), duration: 50 });
  return steps;
}
export function transitionRoute(from, target) {
  if (!from) return [];
  // Retarget a partly entered action by continuing from its visible depth.
  const continuing = from.branch === target && BRANCHES[target];
  const steps = continuing ? [] : exitsFrom(from);
  if (BRANCHES[target]) for (let depth=continuing ? from.depth+1 : 1;depth<=3;depth++) {
    steps.push({ pose: branchCel(target, depth), duration: target === 'sleeping' ? 110 : 75 });
  }
  return steps.length || target==='eating' ? [{ pose: { ...from }, duration: 30 }, ...steps] : [];
}

/** One opaque drawing at a time. Routing uses the actually displayed pose,
 * including interrupted routes; semantic task state is never delayed here. */
export class MotionDirector {
  constructor() { this.action = null; this.lastPose = null; this.route = []; this.phaseStarted = 0; this.restOffset = 0; }
  sample(action, now, paused = false, completedAt = null) {
    const changed = action !== this.action;
    if (changed || paused) {
      const previous = this.action;
      this.route = paused || !this.lastPose || completedAt !== null ? [] : transitionRoute(this.lastPose, action);
      this.routeStarted = now;
      this.phaseStarted = completedAt ?? now + this.route.reduce((sum, step) => sum + step.duration, 0);
      this.restOffset = action === 'resting' && previous && !paused ? RESTING_AFTER_MEAL_PHASE : 0;
      this.action = action;
    }
    let elapsed = now - this.routeStarted, pose, transitioning = false;
    for (const step of this.route) {
      if (elapsed < step.duration) { pose = step.pose; transitioning = true; break; }
      elapsed -= step.duration;
    }
    if (!pose) { this.route = []; pose = actionPose(action, now - this.phaseStarted + this.restOffset, paused); }
    this.lastPose = pose;
    return { ...pose, changed, transitioning, target: action, phaseStarted: this.phaseStarted, needsFrame: !paused && (transitioning || pose.needsFrame === true) };
  }
  reset() { this.action = null; this.lastPose = null; this.route = []; }
}

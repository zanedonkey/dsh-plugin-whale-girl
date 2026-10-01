import { FRAME_REGISTRATION } from './registration.js';
const MEAL_RECOVERY_DURATIONS = [100, 90, 90, 90, 90, 90, 80, 70];
export const EATING_TIMING = Object.freeze({ down: 900, meal: 4800, up: 700, total: 6400 });
export function eatingStage(elapsed, paused = false) {
  if (paused) return { clip: 'eating', elapsed: 0 };
  if (elapsed < EATING_TIMING.down) return { clip: 'eatingDown', elapsed: Math.max(0, elapsed) };
  if (elapsed < EATING_TIMING.down + EATING_TIMING.meal) return { clip: 'eating', elapsed: elapsed - EATING_TIMING.down };
  return { clip: 'eatingUp', elapsed: elapsed - EATING_TIMING.down - EATING_TIMING.meal };
}
export const ANIMATION_CLIPS = Object.freeze({
  resting: { poses: FRAME_REGISTRATION.resting, frames: Array.from({ length: 16 }, (_, i) => i),
    durations: [2400, 140, 120, 140, 220, 520, 220, 1800, 220, 520, 220, 1800, 180, 180, 180, 800] },
  working: { poses: FRAME_REGISTRATION.working, frames: [0, 1, 2, 3, 2, 1], durations: [260, 260, 260, 260, 260, 260] },
  headpat: { poses: FRAME_REGISTRATION.headpat, frames: [0, 1, 2, 1, 3], durations: [260, 260, 320, 260, 260] },
  eating: { poses: FRAME_REGISTRATION.eating, frames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 10, 13, 14, 15], durations: Array(16).fill(100) },
  eatingDown: { poses: FRAME_REGISTRATION.transition, frames: [0, 1, 2, 3, 4, 5, 6, 7], durations: [120, 100, 100, 100, 100, 100, 100, 180], once: true },
  eatingUp: { poses: FRAME_REGISTRATION.transition, frames: [8, 9, 10, 11, 12, 13, 14, 15], durations: MEAL_RECOVERY_DURATIONS, once: true },
});
// The last meal drawing is already standing with open eyes. Resume at the
// matching reopened idle drawing, 80ms before its next gentle glance, instead
// of restarting the 2400ms opening hold. Normal idle keeps its quiet pauses.
export const RESTING_AFTER_MEAL_PHASE = ANIMATION_CLIPS.resting.durations.slice(0, 4).reduce((sum, duration) => sum + duration, 0) - 80;
export function animationFrame(clip, elapsed = 0, paused = false) {
  const definition = ANIMATION_CLIPS[clip];
  if (!definition) return undefined;
  const cycle = definition.durations.reduce((sum, duration) => sum + duration, 0);
  const time = Math.max(0, Number(elapsed) || 0);
  let phase = paused ? 0 : definition.once ? Math.min(time, cycle - 0.001) : time % cycle;
  let step = 0;
  while (phase >= definition.durations[step] && step < definition.frames.length - 1) phase -= definition.durations[step++];
  const frame = definition.frames[step];
  const nextStep = definition.once ? Math.min(step + 1, definition.frames.length - 1) : (step + 1) % definition.frames.length;
  const nextFrame = definition.frames[nextStep];
  const pose = definition.poses[frame], next = definition.poses[nextFrame];
  // Independent drawings cannot be interpolated with opacity: that doubles
  // faces and moving limbs. Hold one registered, fully opaque cel per step.
  return { frame, ...pose, nextFrame, nextRect: next.rect, nextMask: next.mask, mix: 0 };
}
export function applyAnimationPose(image, rect, mask) {
  const key = `${rect.join(',')}/${mask?.join(',') || ''}`;
  if (image.__whaleAnimationRect === key) return;
  image.__whaleAnimationRect = key;
  const [x, y, width, height] = rect;
  image.style.width = `${1254 / width * 100}%`;
  image.style.height = `${1254 / height * 100}%`;
  image.style.left = `${-x / width * 100}%`;
  image.style.top = `${-y / height * 100}%`;
  if (mask) {
    const [mx, my, mw, mh] = mask;
    image.style.clipPath = `inset(${my / 1254 * 100}% ${(1254 - mx - mw) / 1254 * 100}% ${(1254 - my - mh) / 1254 * 100}% ${mx / 1254 * 100}%)`;
  } else image.style.clipPath = '';
}
export function applyAnimationFrame(image, clip, elapsed, paused = false, nextImage) {
  const result = animationFrame(clip, elapsed, paused);
  if (!result) return undefined;
  applyAnimationPose(image, result.rect, result.mask);
  image.style.opacity = '1';
  if (nextImage) {
    nextImage.style.opacity = '0';
  }
  if (image.parentElement) image.parentElement.style.aspectRatio = '1';
  return result.frame;
}

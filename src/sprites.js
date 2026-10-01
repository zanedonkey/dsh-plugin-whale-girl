import { FRAME_REGISTRATION } from './registration.js';
import { applyAnimationPose } from './animation.js';
const STATIC_POSES = Object.fromEntries(['resting', 'working', 'waiting', 'celebrate', 'error', 'sleeping'].map((name, i) => [name, FRAME_REGISTRATION.static[i]]));
export const SPRITE_RECTS = Object.freeze(Object.fromEntries(Object.entries(STATIC_POSES).map(([name, pose]) => [name, pose.rect])));
export function applySprite(image, state) {
  const pose = STATIC_POSES[state] || STATIC_POSES.resting;
  applyAnimationPose(image, pose.rect, pose.mask);
  if (image.parentElement) image.parentElement.style.aspectRatio = '1';
}

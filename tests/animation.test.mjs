import test from 'node:test';
import assert from 'node:assert/strict';
import { animationFrame, applyAnimationFrame, ANIMATION_CLIPS, eatingStage, EATING_TIMING, RESTING_AFTER_MEAL_PHASE } from '../src/animation.js';
import { FRAME_REGISTRATION } from '../src/registration.js';
import { applySprite } from '../src/sprites.js';

test('blink has a long open-eye hold and distinct closed/reopening frames', () => {
  assert.deepEqual([0, 2399, 2400, 2540, 2660, 2800].map(t => animationFrame('resting', t).frame), [0, 0, 1, 2, 3, 4]);
});
test('rice eating loops smoothly through sixteen drawings at a stable time-based speed', () => {
  assert.deepEqual([0, 400, 720, 1160, 1600].map(t => animationFrame('eating', t).frame), [0, 4, 7, 12, 0]);
  assert.deepEqual(animationFrame('eating', 720).rect, FRAME_REGISTRATION.eating[7].rect);
  assert.equal(ANIMATION_CLIPS.coquetry, undefined);
});
test('typing pingpongs, each gesture has distinct drawing cells and paused frames stay still', () => {
  assert.deepEqual([0, 260, 520, 780, 1040, 1300, 1560].map(t => animationFrame('working', t).frame), [0, 1, 2, 3, 2, 1, 0]);
  for (const [name, definition] of Object.entries(ANIMATION_CLIPS)) {
    let elapsed = 0;
    const cells = [];
    for (const duration of definition.durations) {
      const sample = animationFrame(name, elapsed), rect = sample.rect, bounds = sample.mask || rect;
      assert.ok(bounds[0] >= 0 && bounds[1] >= 0 && bounds[0] + bounds[2] <= 1254 && bounds[1] + bounds[3] <= 1254);
      cells.push(JSON.stringify(rect)); elapsed += duration;
    }
    assert.equal(new Set(cells).size, new Set(definition.frames).size);
    assert.equal(animationFrame(name, 999999, true).frame, definition.frames[0]);
  }
  assert.equal(animationFrame('missing', 0), undefined);
});
test('every frame and action boundary stays fully opaque with no double-exposed drawing', () => {
  for (const name of Object.keys(ANIMATION_CLIPS)) {
    const duration = ANIMATION_CLIPS[name].durations[0];
    const early = animationFrame(name, duration - 40);
    const late = animationFrame(name, duration - 1);
    assert.equal(early.mix, 0); assert.equal(late.mix, 0);
    assert.equal(late.nextFrame, animationFrame(name, duration).frame);
    assert.equal(animationFrame(name, duration - 1, true).mix, 0);
    const cycle = ANIMATION_CLIPS[name].durations.reduce((a, b) => a + b, 0);
    assert.equal(animationFrame(name, cycle - 1).nextFrame, ANIMATION_CLIPS[name].once ? ANIMATION_CLIPS[name].frames.at(-1) : 0);
    if (!ANIMATION_CLIPS[name].once) assert.equal(animationFrame(name, cycle).mix, 0);
  }
});
test('idle includes blinking, both glances and a wave separated by quiet holds', () => {
  const idle = ANIMATION_CLIPS.resting;
  assert.equal(new Set(idle.frames).size, 16);
  assert.deepEqual(idle.durations.filter(duration => duration >= 1500), [2400, 1800, 1800]);
  let elapsed = 0;
  for (let i = 0; i < idle.frames.length; i++) { assert.equal(animationFrame('resting', elapsed).frame, i); elapsed += idle.durations[i]; }
  assert.equal(animationFrame('resting', elapsed).frame, 0);
});
test('meal plays one-way preparation, three rice cycles and one-way recovery; reduced motion skips movement', () => {
  assert.equal(EATING_TIMING.total, 6400);
  assert.deepEqual(eatingStage(899), { clip: 'eatingDown', elapsed: 899 });
  assert.deepEqual(eatingStage(900), { clip: 'eating', elapsed: 0 });
  assert.deepEqual(eatingStage(5699), { clip: 'eating', elapsed: 4799 });
  assert.deepEqual(eatingStage(5700), { clip: 'eatingUp', elapsed: 0 });
  assert.deepEqual(eatingStage(400, true), { clip: 'eating', elapsed: 0 });
  for (const [clip, last] of [['eatingDown', 7], ['eatingUp', 15]]) {
    assert.equal(animationFrame(clip, 100000).frame, last);
    assert.equal(animationFrame(clip, 100000).nextFrame, last);
  }
});

test('recovery timing matches its one-way drawings and idle continues within 80ms', () => {
  assert.equal(ANIMATION_CLIPS.eatingUp.durations.reduce((sum, value) => sum + value, 0), EATING_TIMING.up);
  assert.equal(ANIMATION_CLIPS.eatingDown.durations.reduce((sum, value) => sum + value, 0), EATING_TIMING.down);
  assert.equal(EATING_TIMING.down + EATING_TIMING.meal + EATING_TIMING.up, EATING_TIMING.total);
  assert.equal(animationFrame('eatingUp', EATING_TIMING.up - 71).frame, 14);
  assert.equal(animationFrame('eatingUp', EATING_TIMING.up - 70).frame, 15);
  assert.equal(animationFrame('resting', RESTING_AFTER_MEAL_PHASE).frame, 3);
  assert.equal(animationFrame('resting', RESTING_AFTER_MEAL_PHASE + 79).frame, 3);
  assert.equal(animationFrame('resting', RESTING_AFTER_MEAL_PHASE + 80).frame, 4);
  assert.equal(animationFrame('resting', 0).frame, 0);
});
test('drawn frame remains opaque and the spare layer never contributes a ghost', () => {
  const image = { style: {}, parentElement: { style: {} } }, next = { style: {} };
  applyAnimationFrame(image, 'eating', 65, false, next);
  assert.equal(Number(image.style.opacity) + Number(next.style.opacity), 1);
  assert.equal(Number(next.style.opacity), 0);
  assert.equal(image.style.width, `${1254 / 330 * 100}%`);
  applyAnimationFrame(image, 'eating', 65, true, next);
  assert.equal(image.style.opacity, '1'); assert.equal(next.style.opacity, '0');
});

test('all drawn and static poses share one square viewport and fixed shoe origin', () => {
  for (const poses of Object.values(FRAME_REGISTRATION)) for (const pose of poses) {
    const [x, y, width, height] = pose.rect, [center, floor] = pose.anchor;
    assert.equal(width, height);
    assert.ok(Math.abs((center - x) / width - 0.46) < 1e-10);
    assert.ok(Math.abs((floor - y) / height - 0.965) < 1e-10);
  }
  assert.equal(new Set(['resting','eating','transition'].flatMap(name=>FRAME_REGISTRATION[name].map(pose=>pose.rect[2]))).size, 1);
  const image = { style: {}, parentElement: { style: {} } };
  for (const state of ['sleeping', 'waiting', 'error', 'celebrate']) {
    applySprite(image, state); assert.equal(image.parentElement.style.aspectRatio, '1');
    assert.ok(image.style.clipPath.startsWith('inset('));
    applyAnimationFrame(image, 'resting', 0); assert.equal(image.parentElement.style.aspectRatio, '1');
  }
});

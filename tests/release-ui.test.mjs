import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WhaleWidget } from '../src/widget.js';
import { MESSAGES, translate } from '../src/i18n.js';
import { animationFrame, EATING_TIMING, RESTING_AFTER_MEAL_PHASE } from '../src/animation.js';

const source = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/pet.css', import.meta.url), 'utf8');

// Minimal DOM fixture exercises the actual constructor/event handlers without a browser.
// Native layout, pointer delivery and rendering are checked by release-browser-check.mjs.
function fixture(t, language = 'en', now = () => 1000) {
  let document;
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag; this.attributes = {}; this.dataset = {}; this.children = [];
      this.hidden = false; this.value = ''; this.textContent = ''; this.checked = false;
      this.ownerDocument = document; this.listeners = new Map(); this.captures = new Set();
      this.style = { setProperty(key, value) { this[key] = value; } };
      this.offsetWidth = 156; this.offsetHeight = 156;
    }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      if (key === 'hidden') this.hidden = true;
      if (['min', 'max', 'value'].includes(key)) this[key] = value;
    }
    getAttribute(key) { return this.attributes[key] ?? null; }
    removeAttribute(key) { delete this.attributes[key]; }
    toggleAttribute(key, force) { if (force) this.setAttribute(key, ''); else { this.removeAttribute(key); if (key === 'hidden') this.hidden = false; } }
    append(...nodes) { this.children.push(...nodes); }
    prepend(node) { this.children.unshift(node); }
    remove() {}
    replaceChildren() { this.children = []; }
    cloneNode() { return this; }
    focus() { document.activeElement = this; }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
    addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
    dispatch(type, details = {}) {
      const event = { detail: 0, preventDefault() {}, stopPropagation() {}, ...details };
      for (const callback of this.listeners.get(type) || []) callback(event);
    }
    querySelectorAll(selector) {
      const matches = node => selector.startsWith('.') ? (node.attributes.class || '').split(' ').includes(selector.slice(1))
        : selector.startsWith('#') ? node.attributes.id === selector.slice(1)
        : selector.startsWith('[') ? Object.hasOwn(node.attributes, selector.slice(1, -1)) : node.tagName === selector;
      return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    set innerHTML(html) {
      this.content = new Element('fragment');
      for (const [, tag, attributes] of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
        const node = new Element(tag);
        for (const [, key, value] of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) node.setAttribute(key, value ?? '');
        this.content.append(node);
      }
    }
  }
  document = new Element('document');
  document.documentElement = new Element('html');
  document.createElement = tag => new Element(tag);
  document.createElementNS = (_namespace, tag) => new Element(tag);
  document.hidden = false;
  const window = new Element('window');
  window.innerWidth = 1100; window.innerHeight = 850;
  const frameCallbacks = new Map(); let frameSequence = 0;
  window.requestAnimationFrame = callback => { const id = ++frameSequence; frameCallbacks.set(id, callback); return id; };
  window.cancelAnimationFrame = id => frameCallbacks.delete(id);
  const tickFrame = timestamp => { const pending = Array.from(frameCallbacks); frameCallbacks.clear(); for (const [, callback] of pending) callback(timestamp); };
  document.defaultView = window;
  const globals = { document, window, getComputedStyle: () => ({ getPropertyValue: () => '', paddingBottom: '17', paddingLeft: '9', paddingRight: '9', paddingTop: '20' }) };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
  }
  // Any accidental clipboard access fails, even if the implementation catches it.
  let clipboardReads = 0;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get clipboard() { clipboardReads++; throw Error('No clipboard access in formal UI'); } } });
  t.after(() => { if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator; });
  const saved = [], scopes = [];
  const host = new Element(); host.ownerDocument = document;
  host.attachShadow = () => (host.shadowRoot = new Element('shadow'));
  const widget = new WhaleWidget(host, { language, assets: Object.fromEntries(['resting', 'working', 'waiting', 'celebrate', 'sleeping', 'error'].map(state => [state, `${state}.svg`])), css,
    storage: { getItem: () => null, setItem: (_key, value) => saved.push(JSON.parse(value)) }, now, onScopeChange: scope => scopes.push(scope) });
  t.after(() => { widget.dispose(); assert.equal(clipboardReads, 0); });
  return { widget, document, window, saved, scopes, frameCallbacks, tickFrame };
}

test('formal widget has no diagnostic/test controls, collectors, clipboard or telemetry paths', () => {
  assert.doesNotMatch(source, /diagnostic|clipboard|execCommand|permissions\.query|telemetry|data-action|test-button|<textarea/i);
  assert.doesNotMatch(css, /diagnostic|textarea/i);
  assert.doesNotMatch(Object.getOwnPropertyNames(WhaleWidget.prototype).join(' '), /diagnostic|copy|refresh/i);
  assert.match(css, /\.panel\{[^}]*max-width:calc\(100vw - 24px\);[^}]*max-height:calc\(100vh - 80px\);overflow:auto/);
  assert.match(css, /\.setting option::checkmark\{order:1;margin-left:auto/);
  assert.match(css, /\.panel button:focus-visible,\.panel input:focus-visible,\.panel select:focus-visible\{/);
});

for (const language of ['en', 'zh']) {
  test(`${language} formal menu exposes only ordinary localized accessible controls`, t => {
    const { widget } = fixture(t, language);
    const buttons = widget.root.querySelectorAll('button');
    assert.deepEqual(buttons.map(button => button.getAttribute('class')), ['pet-button', 'close', 'action reset', 'action hide', 'restore']);
    assert.deepEqual(widget.root.querySelectorAll('input').map(input => input.getAttribute('id')), ['whale-size', 'whale-motion']);
    assert.deepEqual(widget.root.querySelectorAll('select').map(select => select.getAttribute('id')), ['whale-scope', 'whale-sleep']);
    for (const node of widget.root.querySelectorAll('[data-i18n]')) assert.equal(node.textContent, MESSAGES[language][node.dataset.i18n]);
    for (const node of widget.root.querySelectorAll('[data-i18n-aria]')) assert.equal(node.getAttribute('aria-label'), MESSAGES[language][node.dataset.i18nAria]);
    assert.equal(widget.panel.getAttribute('role'), 'dialog');
    assert.equal(widget.motion.getAttribute('role'), 'switch');
    assert.equal(widget.panel.hidden, true);
    widget.button.dispatch('click');
    assert.equal(widget.panel.hidden, false);
    assert.equal(widget.root.querySelector('.close'), widget.host.ownerDocument.activeElement);
    widget.root.dispatch('keydown', { key: 'Escape' });
    assert.equal(widget.panel.hidden, true);
    assert.equal(widget.button, widget.host.ownerDocument.activeElement);
  });
}

test('English and Chinese dictionaries stay consistent without diagnostic copy', () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.zh).sort());
  for (const language of ['en', 'zh']) for (const [key, value] of Object.entries(MESSAGES[language])) {
    assert.ok(value.trim()); assert.equal(translate(language, key), value);
    assert.doesNotMatch(key, /diagnostic|test|copy/i);
    assert.deepEqual(value.match(/\{\w+\}/g), MESSAGES.en[key].match(/\{\w+\}/g));
  }
});

test('ordinary settings, reset, hide/restore, context menu and outside dismissal still work', t => {
  const { widget: w, document, saved, scopes } = fixture(t);
  w.button.dispatch('contextmenu'); assert.equal(w.panel.hidden, false);
  w.scope.value = 'current'; w.scope.dispatch('change'); w.scope.dispatch('change');
  assert.deepEqual(scopes, ['current']); assert.equal(w.preferences.scope, 'current');
  w.range.value = '125'; w.range.dispatch('input'); assert.equal(w.preferences.scale, 1.25); assert.equal(w.range.getAttribute('aria-valuetext'), '125%');
  w.motion.checked = false; w.motion.dispatch('change'); assert.equal(w.host.dataset.motion, 'false');
  w.sleep.value = '30000'; w.sleep.dispatch('change'); assert.equal(w.machine.sleepAfterMs, 30000);
  w.preferences.x = 100; w.preferences.y = 100; w.root.querySelector('.reset').dispatch('click');
  assert.equal(w.preferences.x, null); assert.equal(w.preferences.y, null);
  w.root.querySelector('.hide').dispatch('click'); assert.equal(w.preferences.hidden, true); assert.equal(w.panel.hidden, true); assert.equal(w.pet.hidden, true); assert.equal(w.restore.hidden, false); assert.equal(document.activeElement, w.restore);
  w.restore.dispatch('click'); assert.equal(w.preferences.hidden, false); assert.equal(w.pet.hidden, false); assert.equal(w.restore.hidden, true); assert.equal(document.activeElement, w.button);
  w.button.dispatch('click', { detail: 1 }); assert.equal(w.machine.view(1000).greeting, true);
  w.openPanel(); document.dispatch('pointerdown', { composedPath: () => [] }); assert.equal(w.panel.hidden, true);
  assert.equal(saved.at(-1).hidden, false);
});

test('keyboard movement and pointer dragging preserve capture, position and persistence', t => {
  const { widget: w, saved } = fixture(t);
  const x = w.position.x;
  w.button.dispatch('keydown', { key: 'ArrowLeft', shiftKey: true }); assert.equal(w.position.x, x - 20);
  const origin = { ...w.position };
  w.button.dispatch('pointerdown', { button: 0, isPrimary: true, pointerId: 1, clientX: 100, clientY: 100 });
  w.button.dispatch('pointermove', { pointerId: 1, clientX: 80, clientY: 70 });
  assert.equal(w.pet.dataset.dragging, 'true'); assert.equal(w.position.x, origin.x - 20); assert.equal(w.position.y, origin.y - 30);
  w.button.dispatch('pointerup', { pointerId: 1 }); assert.equal(w.drag, null); assert.equal(w.button.hasPointerCapture(1), false); assert.equal(saved.at(-1).x, w.position.x);
  w.button.dispatch('click', { detail: 1 }); assert.equal(w.machine.view(1000).greeting, false);
});

test('ordinary snapshots retain working count, waiting, celebration and error behavior', t => {
  const { widget: w } = fixture(t);
  const base = { sessionId: 'release', available: true, running: true, pending: false, workingCount: 2 };
  w.update(base); assert.equal(w.pet.dataset.state, 'working'); assert.equal(w.countText.textContent, '2');
  w.update({ ...base, pending: true }); assert.equal(w.pet.dataset.state, 'waiting'); assert.equal(w.countOverlay.hidden, true);
  w.update({ ...base, workingCount: 1, notice: { id: 'completed', reason: 'completed' } }); assert.equal(w.pet.dataset.state, 'celebrate');
  const messageKey = w.machine.view(1000).noticeKey;
  w.setLanguage('zh'); assert.equal(w.bubbleText.textContent, translate('zh', messageKey)); assert.equal(w.pet.dataset.state, 'celebrate');
  w.update({ ...base, notice: { id: 'error', reason: 'error' } }); assert.equal(w.pet.dataset.state, 'error');
  w.update(base); assert.equal(w.pet.dataset.state, 'working');
});

test('disposal cleans ordinary listeners once and ignores late updates', t => {
  const { widget: w } = fixture(t); let cleanups = 0;
  w.cleanups.push(() => cleanups++); w.dispose(); w.dispose();
  assert.equal(cleanups, 1); assert.equal(w.root.children.length, 0);
  assert.equal(w.button.listeners.get('click').size, 0);
  const snapshot = w.machine.snapshot; w.update({ available: true, running: true }); assert.equal(w.machine.snapshot, snapshot);
});

test('head hold fires at 700 ms and release does not also trigger a click gesture', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { widget: w } = fixture(t);
  w.image.parentElement = { style: {}, getBoundingClientRect: () => ({ left: 0, right: 150, top: 0, height: 150 }) };
  w.button.dispatch('pointerdown', { button: 0, isPrimary: true, pointerId: 1, clientX: 70, clientY: 40 });
  t.mock.timers.tick(699); assert.equal(w.interaction, null);
  t.mock.timers.tick(1); assert.equal(w.interaction.kind, 'headpat');
  assert.match(w.bubbleText.textContent, /head|more|tail/);
  w.button.dispatch('pointerup', { pointerId: 1 });
  w.button.dispatch('click', { detail: 1 }); assert.equal(w.interaction.kind, 'headpat');
});

for (const abort of ['drag', 'cancel', 'capture', 'dispose']) {
  test(`${abort} cancels the pending head hold`, t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { widget: w } = fixture(t);
    w.image.parentElement = { style: {}, getBoundingClientRect: () => ({ left: 0, right: 150, top: 0, height: 150 }) };
    w.button.dispatch('pointerdown', { button: 0, isPrimary: true, pointerId: 1, clientX: 70, clientY: 40 });
    if (abort === 'drag') w.button.dispatch('pointermove', { pointerId: 1, clientX: 90, clientY: 60 });
    if (abort === 'cancel') w.button.dispatch('pointercancel', { pointerId: 1 });
    if (abort === 'capture') w.button.dispatch('lostpointercapture');
    if (abort === 'dispose') w.dispose();
    t.mock.timers.tick(1000); assert.equal(w.interaction, null); assert.equal(w.holdTimer, null);
  });
}

test('eating expires and real task states immediately retain priority', t => {
  let now = 1000;
  const { widget: w } = fixture(t, 'zh', () => now);
  w.update({ sessionId: 's', available: true, running: false });
  w.button.dispatch('click', { detail: 1 }); assert.equal(w.interaction.kind, 'eating');
  now = 7600; w.paint(); assert.equal(w.interaction, null);
  w.interact('headpat');
  w.update({ sessionId: 's', available: true, running: true, pending: true });
  assert.equal(w.interaction, null); assert.equal(w.pet.dataset.state, 'waiting');
  assert.equal(w.bubbleText.textContent, MESSAGES.zh['state.waiting']);
  w.interact('eating'); assert.equal(w.interaction, null);
});

test('drawn frames advance; reduced motion, hiding and disposal stop interaction', t => {
  let now = 1000;
  const { widget: w } = fixture(t, 'en', () => now);
  w.assets.animation = 'frames.png'; w.renderAnimation();
  assert.equal(w.pet.dataset.frame, '0');
  now += 2400; w.renderAnimation(); assert.equal(w.pet.dataset.frame, '1');
  now += 140; w.renderAnimation(); assert.equal(w.pet.dataset.frame, '2');
  w.motionQuery = { matches: true }; w.renderAnimation(); assert.equal(w.pet.dataset.frame, '0');
  w.interact('headpat'); w.preferences.hidden = true; w.applyPreferences();
  assert.equal(w.interaction, null); assert.equal(w.pet.dataset.frame, '0');
  w.dispose(); assert.equal(w.holdTimer, null);
});

test('keyboard P and C offer silent accessible head pats and eating', t => {
  const { widget: w } = fixture(t);
  w.button.dispatch('keydown', { key: 'p' }); assert.equal(w.interaction.kind, 'headpat');
  w.button.dispatch('keydown', { key: 'c' }); assert.equal(w.interaction.kind, 'eating');
  assert.doesNotMatch(source, /new Audio|AudioContext|speechSynthesis|speechSynthesisUtterance|\.mp3/);
});
test('click uses the rice atlas for three full cycles and restores the resting atlas at expiry', t => {
  let now = 1000;
  const { widget: w } = fixture(t, 'zh', () => now);
  w.assets.animation = 'regular-frames.png'; w.assets.eating = 'rice-frames.png';
  w.button.dispatch('click', { detail: 1 });
  assert.equal(w.image.src, 'rice-frames.png'); assert.equal(w.pet.dataset.clip, 'eating');
  assert.match(w.bubbleText.textContent, /饭|饱/);
  now = 1720; w.renderAnimation(); assert.equal(w.pet.dataset.frame, '7');
  const rice = animationFrame('eating', 720).rect;
  assert.equal(w.image.style.top, `${-rice[1] / rice[3] * 100}%`);
  now = 1000 + EATING_TIMING.total - 1; w.paint(); assert.equal(w.interaction.kind, 'eating');
  now = 1000 + EATING_TIMING.total; w.paint(); assert.equal(w.interaction, null);
  now = 7800; w.renderAnimation(); assert.equal(w.image.src, 'regular-frames.png'); assert.equal(w.pet.dataset.clip, 'resting');
});
test('display-synced playback has only one pending callback and stops for all pause conditions', t => {
  let now = 1000;
  const { widget: w, document, frameCallbacks, tickFrame } = fixture(t, 'en', () => now);
  w.assets.animation = 'frames.png'; w.assets.eating = 'rice.png'; w.renderAnimation();
  w.paint(); w.renderAnimation(); assert.equal(frameCallbacks.size, 1);
  w.interact('eating'); now += 65; tickFrame();
  assert.equal(frameCallbacks.size, 1); assert.equal(w.nextImage.style.opacity, '0'); assert.equal(w.image.style.opacity, '1');
  w.preferences.motion = false; w.applyPreferences(); assert.equal(frameCallbacks.size, 0);
  assert.equal(w.image.style.opacity, '1'); assert.equal(w.nextImage.style.opacity, '0');
  w.preferences.motion = true; w.applyPreferences(); assert.equal(frameCallbacks.size, 1);
  w.motionQuery = { matches: true }; w.renderAnimation(); assert.equal(frameCallbacks.size, 0);
  w.motionQuery.matches = false; w.renderAnimation(); assert.equal(frameCallbacks.size, 1);
  document.hidden = true; document.dispatch('visibilitychange'); assert.equal(frameCallbacks.size, 0);
  document.hidden = false; document.dispatch('visibilitychange'); assert.equal(frameCallbacks.size, 1);
  w.preferences.hidden = true; w.applyPreferences(); assert.equal(frameCallbacks.size, 0);
  w.preferences.hidden = false; w.applyPreferences(); assert.equal(frameCallbacks.size, 1);
  w.update({ sessionId: 's', available: true, running: true, pending: true }); assert.equal(frameCallbacks.size, 0);
  w.update({ sessionId: 's', available: true, running: false }); assert.equal(frameCallbacks.size, 1);
  const lateTick = Array.from(frameCallbacks.values())[0]; w.dispose();
  assert.equal(frameCallbacks.size, 0); lateTick(); assert.equal(frameCallbacks.size, 0);
});
test('idle to meal plays registered preparation, eating, recovery and idle without crossfades', t => {
  let now = 1000;
  const { widget: w } = fixture(t, 'zh', () => now);
  Object.assign(w.assets, { animation: 'old.png', idle: 'idle.png', transition: 'transition.png', eating: 'rice.png' });
  w.renderAnimation(); assert.equal(w.image.src, 'idle.png');
  w.button.dispatch('click', { detail: 1 });
  assert.equal(w.pet.dataset.clip, 'eatingDown'); assert.equal(w.image.src, 'transition.png');
  assert.equal(w.nextImage.style.opacity, '0'); assert.equal(w.image.style.opacity, '1');
  now = 1090; w.renderAnimation(); assert.equal(w.nextImage.style.opacity, '0');
  now = 1200; w.renderAnimation(); assert.equal(w.image.src, 'transition.png');
  now = 1900; w.renderAnimation(); assert.equal(w.pet.dataset.clip, 'eating');
  assert.equal(w.image.src, 'rice.png');
  now = 2110; w.renderAnimation(); assert.equal(w.image.src, 'rice.png');
  now = 6700; w.renderAnimation(); assert.equal(w.pet.dataset.clip, 'eatingUp');
  now = 6900; w.renderAnimation(); assert.equal(w.image.src, 'transition.png');
  now = 7600; w.renderAnimation(); assert.equal(w.pet.dataset.clip, 'resting'); assert.equal(w.image.src, 'idle.png');
  now = 7800; w.renderAnimation(); assert.equal(w.image.src, 'idle.png'); assert.equal(w.interaction, null);
});
test('repeated meal clicks preserve the current phase and task priority interrupts the transition', t => {
  let now = 1000; const { widget: w } = fixture(t, 'en', () => now);
  Object.assign(w.assets, { animation: 'old.png', idle: 'idle.png', transition: 'transition.png', eating: 'rice.png' });
  w.interact('eating'); now = 1500; w.renderAnimation();
  const start = w.interaction.started, until = w.interaction.until;
  w.interact('eating'); assert.equal(w.interaction.started, start); assert.equal(w.interaction.until, until);
  w.update({ sessionId: 's', available: true, running: true, pending: true });
  assert.equal(w.interaction, null); assert.equal(w.nextImage.style.opacity, '0');
  assert.equal(w.pet.dataset.state, 'waiting'); assert.equal(w.image.src, 'waiting.svg');
});

test('meal finishes into reopened idle and starts a gentle glance without the opening hold', t => {
  let now = 1000; const { widget: w } = fixture(t, 'zh', () => now);
  Object.assign(w.assets, { animation: 'old.png', idle: 'idle.png', transition: 'transition.png', eating: 'rice.png' });
  w.interact('eating'); const end = w.interaction.until;
  now=end-71; w.renderAnimation(); assert.equal(w.pet.dataset.frame, '14');
  now=end-70; w.renderAnimation(); assert.equal(w.pet.dataset.frame, '15');
  now=end-1; w.renderAnimation(); assert.equal(w.pet.dataset.clip, 'eatingUp');
  now=end; w.renderAnimation();
  assert.equal(w.interaction, null); assert.equal(w.pet.dataset.clip, 'resting');
  assert.equal(w.pet.dataset.frame, '3'); assert.equal(w.image.src, 'idle.png');
  now=end+79; w.renderAnimation(); assert.equal(w.pet.dataset.frame, '3');
  now=end+80; w.renderAnimation(); assert.equal(w.pet.dataset.frame, '4');
  now=end+300; w.renderAnimation(); assert.equal(w.pet.dataset.frame, '5');
  assert.equal(w.image.style.opacity, '1'); assert.equal(w.nextImage.style.opacity, '0');
});

test('late meal completion advances idle using the real end time; other gestures retain normal idle', t => {
  let now = 1000; const { widget: w } = fixture(t, 'en', () => now);
  Object.assign(w.assets, { animation: 'old.png', idle: 'idle.png', transition: 'transition.png', eating: 'rice.png' });
  w.interact('eating'); const end = w.interaction.until;
  now=end+350; w.paint();
  assert.equal(w.animationStarted, end-RESTING_AFTER_MEAL_PHASE);
  assert.equal(w.pet.dataset.frame, '5');
  now=end+400; w.paint(); assert.equal(w.animationStarted, end-RESTING_AFTER_MEAL_PHASE);
  w.preferences.motion=false; w.renderAnimation(); assert.equal(w.pet.dataset.frame, '0');
  w.preferences.motion=true; w.renderAnimation(); assert.equal(w.pet.dataset.frame, '5');
  w.interact('headpat'); now=w.interaction.until; w.renderAnimation();
  assert.equal(w.pet.dataset.frame, '0'); assert.equal(w.animationStarted, now);
});
test('reduced motion presents one rice pose without preparation, recovery or crossfades', t => {
  const { widget: w, frameCallbacks } = fixture(t);
  Object.assign(w.assets, { animation: 'old.png', idle: 'idle.png', transition: 'transition.png', eating: 'rice.png' });
  w.preferences.motion = false; w.interact('eating');
  assert.equal(w.pet.dataset.clip, 'eating'); assert.equal(w.pet.dataset.frame, '0');
  assert.equal(w.image.src, 'rice.png'); assert.equal(w.nextImage.style.opacity, '0');
  assert.equal(frameCallbacks.size, 0);
});

test('all sampled moments in a full meal show exactly one opaque cel with grounded CSS', t => {
  let now = 1000; const { widget: w } = fixture(t, 'zh', () => now);
  Object.assign(w.assets, { animation: 'old.png', idle: 'idle.png', transition: 'transition.png', eating: 'rice.png' });
  w.interact('eating');
  for (const elapsed of [0,65,90,119,120,450,899,900,965,1600,5699,5700,5765,6500,6599,6600,6665]) {
    now=1000+elapsed; w.renderAnimation();
    assert.equal(w.image.style.opacity, '1'); assert.equal(w.nextImage.style.opacity, '0');
  }
  assert.match(css, /\.pet\[data-clip\] \.pet-art\{animation:none;transform:none\}/);
  assert.doesNotMatch(css, /mix-blend-mode:plus-lighter/);
});
test('drag cancels screen refresh and pointer release or capture loss resumes one loop', t => {
  const { widget: w, frameCallbacks } = fixture(t);
  w.assets.animation = 'frames.png'; w.renderAnimation();
  w.button.dispatch('pointerdown', { button: 0, isPrimary: true, pointerId: 1, clientX: 70, clientY: 40 });
  w.button.dispatch('pointermove', { pointerId: 1, clientX: 90, clientY: 60 });
  assert.equal(frameCallbacks.size, 0);
  w.button.dispatch('pointerup', { pointerId: 1 }); assert.equal(frameCallbacks.size, 1);
  w.button.dispatch('pointerdown', { button: 0, isPrimary: true, pointerId: 2, clientX: 70, clientY: 40 });
  w.button.dispatch('pointermove', { pointerId: 2, clientX: 90, clientY: 60 });
  assert.equal(frameCallbacks.size, 0);
  w.button.dispatch('lostpointercapture'); assert.equal(frameCallbacks.size, 1);
});
test('240 Hz callbacks cap drawing at 60 Hz while animation speed follows elapsed time', t => {
  let now = 1000;
  const { widget: w, frameCallbacks, tickFrame } = fixture(t, 'en', () => now);
  w.assets.animation = 'frames.png'; w.assets.eating = 'rice.png'; w.interact('eating');
  let renders = 0; const render = w.renderAnimation.bind(w);
  w.renderAnimation = () => { renders++; render(); };
  for (let i = 0; i < 240; i++) { now = 1000 + i * 1000 / 240; tickFrame(i * 1000 / 240); }
  assert.equal(renders, 60); assert.equal(frameCallbacks.size, 1);
  assert.equal(w.pet.dataset.frame, '9');
});

test('full motion assets preserve semantic priority, route cleanup and interaction duration',t=>{
  let now=1000;const {widget:w,frameCallbacks}=fixture(t,'zh',()=>now);
  Object.assign(w.assets,{idle:'idle.png',actions:'actions.png',expressions:'expressions.png',eating:'rice.png',transition:'meal.png'});
  w.renderAnimation();w.interact('eating');now+=1500;w.renderAnimation();assert.equal(w.pet.dataset.clip,'eating');
  w.update({sessionId:'s',available:true,running:true,pending:true});
  assert.equal(w.interaction,null);assert.equal(w.pet.dataset.state,'waiting');assert.equal(w.pet.dataset.transition,'waiting');
  assert.equal(w.bubbleText.textContent,MESSAGES.zh['state.waiting']);assert.equal(frameCallbacks.size,1);
  now=w.motionDirector.phaseStarted;w.renderAnimation();assert.equal(w.pet.dataset.asset,'actions');assert.equal(frameCallbacks.size,0);
  w.update({sessionId:'s',available:true,running:false});w.interact('headpat');
  assert.equal(w.interaction.started,w.motionDirector.phaseStarted);assert.equal(w.interaction.until-w.interaction.started,2800);
  now=w.interaction.until;w.renderAnimation();assert.equal(w.pet.dataset.transition,'resting');
  now=w.motionDirector.phaseStarted;w.renderAnimation();assert.equal(w.pet.dataset.frame,'3');
  now+=80;w.renderAnimation();assert.equal(w.pet.dataset.frame,'4');
  assert.equal(w.image.style.opacity,'1');assert.equal(w.nextImage.style.opacity,'0');
});

import { PetStateMachine, cleanPreferences, clampPosition, STORAGE_KEY } from './state.js';
import { normalizeLanguage, translate, chooseInteractionKey } from './i18n.js';
import { acquireBubbleFonts } from './fonts.js';
import { bubbleLayout, panelLayout } from './bubble-layout.js';
import { attachBubbleSurface } from './bubble-surface.js';
import { applySprite } from './sprites.js';
import { animationFrame, applyAnimationPose, eatingStage, EATING_TIMING, RESTING_AFTER_MEAL_PHASE } from './animation.js';
import { MotionDirector } from './motion.js';

/** Framework-independent UI shared by the real plugin and offline preview. */
export class WhaleWidget {
  constructor(host, { assets, css, fonts, storage, language = 'en', now = () => Date.now(), onView = () => {}, onScopeChange = () => {} } = {}) {
    this.host = host;
    this.language = normalizeLanguage(language);
    this.originalLang = host.getAttribute('lang');
    this.now = now;
    this.onView = onView;
    this.onScopeChange = onScopeChange;
    this.assets = assets;
    this.interaction = null;
    this.lastInteractionMessages = {};
    this.motionDirector = new MotionDirector();
    this.holdTimer = null;
    this.animationStarted = now();
    this.frameRequest = null;
    this.lastAnimationTick = null;
    this.requestFrame = window.requestAnimationFrame?.bind(window);
    this.cancelFrame = window.cancelAnimationFrame?.bind(window);
    this.animationTick = (timestamp = this.now()) => {
      this.frameRequest = null;
      if (this.disposed) return;
      // Display sync, capped at 60 renders/s on 120/240Hz monitors.
      if (this.lastAnimationTick === null || timestamp - this.lastAnimationTick >= 1000 / 60 - 0.5) {
        this.lastAnimationTick = timestamp;
        this.renderAnimation();
      } else this.frameRequest = this.requestFrame(this.animationTick);
    };
    this.motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.cleanups = [];
    this.disposed = false;
    this.storage = storage;
    if (storage === undefined) { try { this.storage = window.localStorage; } catch { this.storage = null; } }
    let saved;
    try { saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) || 'null'); } catch { /* corrupt storage is optional */ }
    this.preferences = cleanPreferences(saved);
    this.machine = new PetStateMachine(now(), this.preferences.sleepAfterMs);
    this.root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    this.root.replaceChildren();
    const sheet = document.createElement('style');
    sheet.textContent = css;
    this.root.append(sheet);
    // Static markup, character sheets rendered as inert images.
    const template = document.createElement('template');
    template.innerHTML = `
      <div class="pet" data-state="resting">
        <div class="bubble" aria-hidden="true"><span class="bubble-message"></span></div><span class="ground"></span>
        <button type="button" class="pet-button" aria-label="Whale girl companion" aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight P C">
          <span class="pet-art">
            <img class="pet-image" alt="" draggable="false" />
            <img class="pet-image pet-image-next" alt="" draggable="false" aria-hidden="true" />
          </span>
          <svg class="working-count" viewBox="0 0 190 190" aria-hidden="true" focusable="false" hidden>
            <circle cx="156" cy="162" r="12" fill="#edf5ff" stroke="#b7cbea" />
            <text class="working-count-text" x="156" y="163" text-anchor="middle" dominant-baseline="central"></text>
          </svg>
        </button>
        <div class="sparkles" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span></div>
        <div class="affection" aria-hidden="true"><span>♡</span><span>♡</span></div>
      </div>
      <section class="panel" role="dialog" data-i18n-aria="panel.aria" hidden>
        <div class="panel-head"><strong data-i18n="panel.title"></strong><button class="close" type="button" data-i18n-aria="panel.close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
        <p class="subtitle"><span data-i18n="panel.subtitle1"></span></p>
        <div class="setting"><label for="whale-scope" data-i18n="setting.scope"></label><span class="select-control"><select id="whale-scope"><option value="current" data-i18n="setting.scopeCurrent"></option><option value="global" data-i18n="setting.scopeGlobal"></option></select><span class="select-arrow" aria-hidden="true"></span></span></div>
        <div class="setting"><label for="whale-size"><span data-i18n="setting.size"></span> <output class="size-value"></output></label><input id="whale-size" type="range" min="65" max="160" step="5" /></div>
        <div class="setting"><label for="whale-motion" data-i18n="setting.motion"></label><input id="whale-motion" type="checkbox" role="switch" /></div>
        <div class="setting"><label for="whale-sleep" data-i18n="setting.sleep"></label><span class="select-control"><select id="whale-sleep"><option value="30000" data-i18n="setting.seconds30"></option><option value="120000" data-i18n="setting.minutes2"></option><option value="300000" data-i18n="setting.minutes5"></option></select><span class="select-arrow" aria-hidden="true"></span></span></div>
        <div class="panel-actions"><button class="action reset" type="button" data-i18n="action.reset"></button><button class="action hide" type="button" data-i18n="action.hide"></button></div>
      </section>
      <button class="restore" type="button" hidden data-i18n-aria="action.restoreAria" data-i18n="action.restore"></button>`;
    this.root.append(template.content.cloneNode(true));
    this.pet = this.root.querySelector('.pet');
    this.button = this.root.querySelector('.pet-button');
    this.image = this.root.querySelector('.pet-image');
    this.nextImage = this.root.querySelector('.pet-image-next');
    this.countOverlay = this.root.querySelector('.working-count');
    this.countText = this.root.querySelector('.working-count-text');
    this.scope = this.root.querySelector('#whale-scope');
    this.bubble = this.root.querySelector('.bubble');
    this.bubbleText = this.root.querySelector('.bubble-message');
    this.bubbleSurface = attachBubbleSurface(this.bubble, () => this.positionBubble());
    this.cleanups.push(() => this.bubbleSurface.dispose());
    this.panel = this.root.querySelector('.panel');
    this.restore = this.root.querySelector('.restore');
    this.range = this.root.querySelector('#whale-size');
    this.motion = this.root.querySelector('#whale-motion');
    this.sleep = this.root.querySelector('#whale-sleep');
    const fontLease = acquireBubbleFonts(host.ownerDocument, fonts);
    this.fontsReady = fontLease.ready;
    this.cleanups.push(() => fontLease.release());
    this.fontsReady.then(() => { if (!this.disposed) this.positionBubble(); });
    this.listen(this.image, 'load', () => this.positionBubble());
    this.listen(this.button, 'pointerdown', e => this.pointerDown(e));
    this.listen(this.button, 'pointermove', e => this.pointerMove(e));
    this.listen(this.button, 'pointerup', e => this.pointerEnd(e));
    this.listen(this.button, 'pointercancel', e => this.pointerEnd(e, true));
    this.listen(this.button, 'lostpointercapture', () => { this.clearHold(); this.drag = null; delete this.pet.dataset.dragging; this.renderAnimation(); });
    this.listen(this.button, 'click', e => {
      if (this.suppressClick) { this.suppressClick = false; return; }
      if (e.detail === 0) this.openPanel();
      else this.interact('eating');
    });
    this.listen(this.button, 'contextmenu', e => { e.preventDefault(); this.clearHold(); this.openPanel(); });
    this.listen(this.button, 'keydown', e => {
      if (!e.repeat && (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'c')) {
        e.preventDefault(); this.interact(e.key.toLowerCase() === 'p' ? 'headpat' : 'eating'); return;
      }
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (directions[e.key]) {
        e.preventDefault(); const [dx, dy] = directions[e.key]; const step = e.shiftKey ? 20 : 5;
        this.preferences.x = this.position.x + dx * step;
        this.preferences.y = this.position.y + dy * step;
        this.reposition(); this.save();
      }
    });
    this.listen(this.root.querySelector('.close'), 'click', () => this.closePanel());
    this.listen(this.root, 'keydown', e => {
      if (e.key !== 'Escape' || this.panel.hidden) return;
      // First Escape belongs to the native picker; the next closes the settings.
      if (this.root.querySelector('select:open')) { e.stopPropagation(); return; }
      e.preventDefault(); e.stopPropagation(); this.closePanel();
    });
    this.listen(document, 'pointerdown', e => {
      if (!this.panel.hidden && !e.composedPath().includes(host)) this.closePanel(false);
    });
    this.listen(this.range, 'input', () => {
      this.preferences.scale = Number(this.range.value) / 100; this.applyPreferences(); this.save();
    });
    this.listen(this.scope, 'change', () => {
      const scope = this.scope.value === 'current' ? 'current' : 'global';
      if (scope === this.preferences.scope) return;
      this.preferences.scope = scope; this.save();
      this.onScopeChange(scope); this.paint();
    });
    this.listen(this.motion, 'change', () => {
      this.preferences.motion = this.motion.checked; this.applyPreferences(); this.save();
    });
    this.listen(this.sleep, 'change', () => {
      this.preferences.sleepAfterMs = Number(this.sleep.value);
      this.machine.sleepAfterMs = this.preferences.sleepAfterMs; this.save(); this.paint();
    });
    this.listen(this.root.querySelector('.reset'), 'click', () => {
      this.preferences.x = null; this.preferences.y = null; this.reposition(); this.save();
    });
    this.listen(this.root.querySelector('.hide'), 'click', () => {
      this.preferences.hidden = true; this.closePanel(false); this.applyPreferences(); this.save(); this.restore.focus();
    });
    this.listen(this.restore, 'click', () => {
      this.preferences.hidden = false; this.machine.touch(this.now()); this.applyPreferences(); this.save(); this.button.focus(); this.paint();
    });
    this.listen(window, 'resize', () => this.reposition());
    this.listen(document, 'visibilitychange', () => { this.visibility(); this.paint(); });
    this.listen(window, 'storage', e => {
      if (e.key !== STORAGE_KEY && e.key !== null) return;
      let preferences;
      try { preferences = cleanPreferences(JSON.parse(e.newValue || 'null')); } catch { /* ignore malformed cross-tab data */ return; }
      const changedScope = preferences.scope !== this.preferences.scope;
      this.preferences = preferences; this.applyPreferences();
      if (changedScope) this.onScopeChange(this.preferences.scope);
      this.paint();
    });
    this.interval = setInterval(() => { if (!document.hidden && !this.preferences.hidden) this.paint(); }, 500);
    this.cleanups.push(() => clearInterval(this.interval));
    this.cleanups.push(() => { this.stopAnimation(); this.clearHold(); });
    if (this.motionQuery?.addEventListener) this.listen(this.motionQuery, 'change', () => this.renderAnimation());
    this.applyPreferences(); this.setLanguage(this.language);
  }
  setLanguage(language) {
    if (this.disposed) return;
    this.language = normalizeLanguage(language);
    this.host.setAttribute('lang', this.language);
    for (const element of this.root.querySelectorAll('[data-i18n]')) {
      element.textContent = translate(this.language, element.dataset.i18n);
    }
    for (const element of this.root.querySelectorAll('[data-i18n-aria]')) {
      element.setAttribute('aria-label', translate(this.language, element.dataset.i18nAria));
    }
    // Update text in place: keep pointer capture, focus, timers, phase and preferences.
    this.paint();
    if (!this.panel.hidden) this.positionPanel();
  }
  listen(target, event, callback, options) {
    target.addEventListener(event, callback, options);
    this.cleanups.push(() => target.removeEventListener(event, callback, options));
  }
  save() { try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.preferences)); } catch { /* storage denial does not break the pet */ } }
  visibility() {
    this.host.dataset.paused = String(document.hidden || this.preferences.hidden);
    if (document.hidden || this.preferences.hidden) { this.clearHold(); this.interaction = null; }
  }
  applyPreferences() {
    this.range.value = String(Math.round(this.preferences.scale * 100));
    this.root.querySelector('.size-value').textContent = `${this.range.value}%`;
    this.range.setAttribute('aria-valuetext', `${this.range.value}%`);
    this.range.style.setProperty('--range-progress', `${(Number(this.range.value) - Number(this.range.min)) / (Number(this.range.max) - Number(this.range.min)) * 100}%`);
    this.scope.value = this.preferences.scope;
    this.motion.checked = this.preferences.motion;
    this.sleep.value = String(this.preferences.sleepAfterMs);
    this.machine.sleepAfterMs = this.preferences.sleepAfterMs;
    this.host.dataset.motion = String(this.preferences.motion);
    this.pet.hidden = this.preferences.hidden; this.restore.hidden = !this.preferences.hidden;
    if (this.preferences.hidden) this.closePanel(false);
    this.visibility(); this.reposition();
    this.renderAnimation();
  }
  reposition() {
    const size = 190 * this.preferences.scale;
    this.pet.style.width = `${size}px`; this.pet.style.height = `${size}px`;
    const top = Math.max(56, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-top-clearance')) || 0);
    this.position = clampPosition(this.preferences.x ?? window.innerWidth - size - 24,
      this.preferences.y ?? window.innerHeight - size - 90, size, size, window.innerWidth, window.innerHeight, top);
    this.pet.style.left = `${this.position.x}px`; this.pet.style.top = `${this.position.y}px`;
    this.positionBubble();
    if (!this.panel.hidden) this.positionPanel();
  }
  positionBubble() {
    if (this.disposed || !this.position || this.preferences.hidden) return;
    this.bubbleSurface.update();
    const size = 190 * this.preferences.scale;
    const button = getComputedStyle(this.button);
    const bottomInset = parseFloat(button.paddingBottom) || 0;
    const artWidth = size - (parseFloat(button.paddingLeft) || 0) - (parseFloat(button.paddingRight) || 0);
    const availableHeight = size - (parseFloat(button.paddingTop) || 0) - bottomInset;
    const ratio = 418 / 648;
    const layout = bubbleLayout({
      x: this.position.x, y: this.position.y, size,
      width: this.bubble.offsetWidth, height: this.bubble.offsetHeight,
      visibleHeight: Math.min(availableHeight, artWidth / ratio), bottomInset,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      topClearance: Math.max(56, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-top-clearance')) || 0),
    });
    this.bubble.style.left = `${layout.left - this.position.x}px`;
    this.bubble.style.top = `${layout.top - this.position.y}px`;
    this.bubble.style.bottom = 'auto';
    this.bubble.style.setProperty('--tail-x', `${layout.tailX}px`);
    this.bubble.dataset.side = layout.side;
  }
  positionPanel() {
    const size = 190 * this.preferences.scale;
    const width = this.panel.offsetWidth || Math.min(280, window.innerWidth - 24);
    const height = this.panel.offsetHeight || 310;
    const position = panelLayout({ ...this.position, size, width, height, viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight, topClearance: Math.max(56, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-top-clearance')) || 0) });
    this.panel.style.left = `${position.left}px`; this.panel.style.top = `${position.top}px`;
  }
  openPanel() { this.panel.hidden = false; this.pet.dataset.panelOpen = 'true'; this.positionPanel(); this.root.querySelector('.close').focus(); }
  closePanel(focus = true) {
    this.panel.hidden = true;
    delete this.pet.dataset.panelOpen;
    if (focus) this.button.focus();
  }
  pointerDown(e) {
    if (e.button !== 0 || !e.isPrimary) return;
    this.suppressClick = false;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, originX: this.position.x, originY: this.position.y, moved: false };
    this.button.setPointerCapture(e.pointerId);
    this.clearHold();
    const art = this.image.parentElement;
    const bounds = art?.getBoundingClientRect ? art.getBoundingClientRect() : null;
    if (bounds && e.clientY >= bounds.top && e.clientY <= bounds.top + bounds.height * 0.55 && e.clientX >= bounds.left && e.clientX <= bounds.right) {
      this.holdTimer = setTimeout(() => {
        this.holdTimer = null;
        if (!this.disposed && this.drag?.id === e.pointerId && !this.drag.moved) {
          this.drag.patted = true; this.interact('headpat');
        }
      }, 700);
    }
  }
  pointerMove(e) {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
    if (!this.drag.moved) return;
    this.clearHold();
    this.interaction = null;
    this.pet.dataset.dragging = 'true';
    this.preferences.x = this.drag.originX + dx; this.preferences.y = this.drag.originY + dy;
    this.reposition();
    this.renderAnimation();
  }
  pointerEnd(e, cancelled = false) {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    this.clearHold();
    this.suppressClick = this.drag.moved || cancelled || this.drag.patted;
    if (cancelled) this.interaction = null;
    if (this.drag.moved) {
      this.preferences.x = this.position.x; this.preferences.y = this.position.y; this.save();
    }
    this.drag = null; delete this.pet.dataset.dragging;
    if (this.button.hasPointerCapture(e.pointerId)) this.button.releasePointerCapture(e.pointerId);
    this.renderAnimation();
  }
  clearHold() { if (this.holdTimer !== null) clearTimeout(this.holdTimer); this.holdTimer = null; }
  interact(kind) {
    if (this.disposed || this.preferences.hidden || document.hidden) return;
    const now = this.now();
    this.machine.touch(now);
    // Real waiting/error/completion/working always keep their actual task display.
    if (this.machine.view(now).state === 'resting') {
      // Repeated clicks continue the meal instead of snapping back to standing.
      if (kind === 'eating' && this.interaction?.kind === 'eating') return;
      const messageKey = chooseInteractionKey(kind, this.lastInteractionMessages[kind]);
      this.lastInteractionMessages[kind] = messageKey;
      this.interaction = { kind, started: now, until: now + (kind === 'eating' ? EATING_TIMING.total : 2800),
        messageKey };
    }
    this.paint();
  }
  renderAnimation() {
    if (this.disposed) return;
    const now = this.now(), view = this.machine.view(now);
    const completedMealAt = this.interaction?.kind === 'eating' && now >= this.interaction.until && view.state === 'resting' ? this.interaction.until : null;
    if (this.interaction && (now >= this.interaction.until || view.state !== 'resting')) this.interaction = null;
    const kind = this.interaction?.kind;
    if (kind) this.pet.dataset.interaction = kind; else delete this.pet.dataset.interaction;
    const paused = !this.preferences.motion || this.motionQuery?.matches === true || document.hidden || this.preferences.hidden || this.drag?.moved;
    if (this.assets.actions && this.assets.expressions && this.assets.idle) {
      this.renderDirectedMotion(kind || view.state, now, paused, completedMealAt);
      return;
    }
    const stage = kind === 'eating' && this.assets.transition ? eatingStage(now - this.interaction.started, paused) : null;
    const clip = kind === 'eating' ? (this.assets.eating && (stage?.clip || kind)) : this.assets.animation && (kind || (['resting', 'working'].includes(view.state) ? view.state : undefined));
    if (clip !== this.currentClip) {
      this.currentClip = clip;
      // Anchor to the real completion time so a delayed render advances rather
      // than creating another pause at the transition back to idle.
      this.animationStarted = clip === 'resting' && completedMealAt !== null ? completedMealAt - RESTING_AFTER_MEAL_PHASE : now;
    }
    let asset = clip === 'resting' ? this.assets.idle || this.assets.animation : clip === 'eating' ? this.assets.eating : stage && clip !== 'eating' ? this.assets.transition : clip ? this.assets.animation : this.assets[view.state];
    if (clip) {
      const sample = animationFrame(clip, stage?.elapsed ?? now - this.animationStarted, paused);
      if(sample.assetKey)asset=this.assets[sample.assetKey]||asset;
      if (this.image.__whaleAsset !== asset) { this.image.__whaleAsset = asset; this.image.src = asset; }
      applyAnimationPose(this.image, sample.rect, sample.mask);
      this.image.style.opacity = '1'; this.nextImage.style.opacity = '0';
      this.currentAsset = asset;
      if (this.image.parentElement) this.image.parentElement.style.aspectRatio = '1';
      this.pet.dataset.clip = clip;
      this.pet.dataset.frame = String(sample.frame);
    } else {
      if (this.image.__whaleAsset !== asset) { this.image.__whaleAsset = asset; this.image.src = asset; }
      this.currentAsset = asset;
      delete this.pet.dataset.clip; delete this.pet.dataset.frame;
      applySprite(this.image, view.state);
      this.image.style.opacity = '1'; this.nextImage.style.opacity = '0';
    }
    if (clip && !paused && this.requestFrame) {
      if (this.frameRequest === null) this.frameRequest = this.requestFrame(this.animationTick);
    } else this.stopAnimation();
  }
  renderDirectedMotion(action, now, paused, completedMealAt) {
    const sample = this.motionDirector.sample(action, now, paused, completedMealAt);
    // Interactive durations begin after any prop cleanup / entry movement.
    if (sample.changed && this.interaction && this.interaction.kind === action) {
      this.interaction.started = sample.phaseStarted;
      this.interaction.until = sample.phaseStarted + (action === 'eating' ? EATING_TIMING.total : 2800);
    }
    const asset = this.assets[sample.assetKey];
    if (this.image.__whaleAsset !== asset) { this.image.__whaleAsset = asset; this.image.src = asset; }
    applyAnimationPose(this.image, sample.rect, sample.mask);
    this.image.style.opacity = '1'; this.nextImage.style.opacity = '0';
    this.image.parentElement && (this.image.parentElement.style.aspectRatio = '1');
    this.currentAsset = asset; this.currentClip = sample.clip;
    this.animationStarted = sample.phaseStarted - this.motionDirector.restOffset;
    this.pet.dataset.directed = 'true'; this.pet.dataset.clip = sample.clip;
    this.pet.dataset.frame = String(sample.frame); this.pet.dataset.asset = sample.assetKey;
    this.pet.dataset.displayAction = sample.branch;
    if (sample.transitioning) this.pet.dataset.transition = action; else delete this.pet.dataset.transition;
    if (sample.needsFrame && this.requestFrame) {
      if (this.frameRequest === null) this.frameRequest = this.requestFrame(this.animationTick);
    } else this.stopAnimation();
  }
  stopAnimation() {
    if (this.frameRequest !== null) this.cancelFrame?.(this.frameRequest);
    this.frameRequest = null;
    this.lastAnimationTick = null;
  }
  update(snapshot) { if (!this.disposed) { this.machine.update(snapshot, this.now()); this.paint(); } }
  paint() {
    if (this.disposed) return;
    const view = this.machine.view(this.now());
    this.pet.dataset.state = view.state;
    this.renderAnimation();
    this.pet.dataset.notice = String(Boolean(this.interaction || view.noticeKey || ['waiting', 'celebrate', 'error'].includes(view.state) || view.greeting));
    this.pet.dataset.touch = String(Boolean(view.greeting && !view.noticeKey && !['waiting', 'working', 'celebrate', 'error'].includes(view.state)));
    const count = view.state === 'working' && Number.isFinite(view.workingCount) ? Math.max(0, Math.floor(view.workingCount)) : 0;
    this.countOverlay.toggleAttribute('hidden', count === 0);
    this.countText.textContent = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    const messageKey = this.interaction?.messageKey || view.noticeKey || (view.greeting && view.state === 'resting' ? 'pet.greeting' : view.messageKey);
    const message = translate(this.language, messageKey);
    this.bubbleText.textContent = message;
    this.positionBubble();
    // The decorative screen number is announced once, with its actual count,
    // as part of the button label, and never leaks into resting greetings.
    const status = count > 0 ? `${message} ${translate(this.language, count === 1 ? 'pet.workingCountOne' : 'pet.workingCount', { count })}` : message;
    this.button.setAttribute('aria-label', translate(this.language, 'pet.aria', { status }));
    this.onView(view);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
    this.root.replaceChildren();
    delete this.host.dataset.paused; delete this.host.dataset.motion;
    if (this.originalLang === null) this.host.removeAttribute('lang');
    else this.host.setAttribute('lang', this.originalLang);
  }
}

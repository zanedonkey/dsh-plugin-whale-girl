// Offline-only release regression check. Requires CHROME_PATH and a freshly built preview.
// Uses a fresh temporary profile; never attaches to a user's browser or live DSH GUI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const preview = path.join(root, 'preview/index.html');
const chromePath = process.env.CHROME_PATH;
assert.ok(chromePath, 'Set CHROME_PATH to your installed Chromium executable');
assert.ok(fs.existsSync(preview), 'Build the offline preview before running this check');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-release-check-'));
const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let socket;
let chromeOutput = '';
chrome.stderr.on('data', chunk => { chromeOutput = (chromeOutput + chunk.toString()).slice(-12000); });
const pending = new Map();
let sequence = 0;
const exceptionEvents = [], consoleErrors = [], networkRequests = [];
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chrome debugger startup timed out')), 15000);
    chrome.once('error', error => { clearTimeout(timer); reject(error); });
    chrome.once('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited before debugger: ${code}`)); });
    chrome.stderr.on('data', chunk => { output += chunk.toString(); const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptionEvents.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params.args.map(arg => arg.value ?? arg.description));
    if (message.method === 'Network.requestWillBeSent' && /^(?:https?|wss?):/i.test(message.params.request.url)) networkRequests.push(message.params.request.url);
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result);
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => call(method, params, sessionId);
  await page('Runtime.enable'); await page('Page.enable'); await page('Network.enable');
  await page('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*'] });
  await page('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__clipboardCalls = 0; window.__unhandled = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get() { window.__clipboardCalls++; throw new Error('Formal UI must not access clipboard'); } });
    document.execCommand = () => { window.__clipboardCalls++; throw new Error('Formal UI must not use legacy clipboard commands'); };
    window.addEventListener('unhandledrejection', event => window.__unhandled.push(String(event.reason)));
  ` });
  await page('Emulation.setDeviceMetricsOverride', { width: 1100, height: 850, deviceScaleFactor: 1, mobile: false });
  await page('Page.navigate', { url: pathToFileURL(preview).href });
  const evaluate = async expression => {
    const result = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await evaluate(`new Promise((resolve,reject)=>{let count=0;const ready=()=>{if(window.previewPet) resolve(true);else if(++count>100)reject(new Error('preview missing'));else setTimeout(ready,30)};ready()})`);
  await evaluate(`previewPet.fontsReady`);
  assert.equal((await evaluate(`document.querySelector('.version').textContent`)).trim(), `DSH PLUGIN / ${version}`, 'Preview must match current package version');
  assert.equal(await evaluate(`location.protocol`), 'file:');
  assert.equal(await evaluate(`previewPet.panel.hidden`), true);
  const bubbleStyles = await evaluate(`(()=>{const w=previewPet,originalView=w.machine.view,interaction=w.interaction,samples=[];try{for(const action of ['resting','working','waiting','celebrate','error','sleeping','eating','headpat']){w.machine.view=()=>({state:['eating','headpat'].includes(action)?'resting':action,available:true,messageKey:'state.'+(['eating','headpat'].includes(action)?'resting':action),workingCount:action==='working'?1:0});w.interaction=['eating','headpat'].includes(action)?{kind:action,started:w.now(),until:w.now()+10000,messageKey:'interaction.'+action+'.0'}:null;w.paint();const text=getComputedStyle(w.bubbleText),box=getComputedStyle(w.bubble),surface=getComputedStyle(w.bubbleSurface.path);samples.push({action,font:text.fontFamily,size:text.fontSize,weight:text.fontWeight,lineHeight:text.lineHeight,spacing:text.letterSpacing,padding:box.padding,radius:box.borderRadius,fill:surface.fill,stroke:surface.stroke});}return samples;}finally{w.machine.view=originalView;w.interaction=interaction;w.motionDirector.reset();w.paint();}})()`);
  for (const {action,...style} of bubbleStyles) {
    assert.deepEqual(style,Object.fromEntries(Object.entries(bubbleStyles[0]).filter(([key])=>key!=='action')), action+' bubble style must match idle');
    assert.match(style.font,/Whale Bubble Latin/);assert.match(style.font,/Whale Bubble Han/);
  }
  assert.equal(await evaluate(`document.fonts.check('400 15px "Whale Bubble Han"')&&document.fonts.check('500 15px "Whale Bubble Latin"')`),true);
  await evaluate(`Promise.all(Array.from(document.images, image => image.decode()))`);
  const idleRefresh = await evaluate(`(()=>{
    const w=previewPet,position=w.positionBubble,observer=new MutationObserver(()=>{});
    let layouts=0; w.positionBubble=function(){layouts++;return position.call(this)};
    observer.observe(w.bubbleText,{childList:true,characterData:true,subtree:true});
    try { for(let i=0;i<20;i++)w.paint();return {layouts,textMutations:observer.takeRecords().length}; }
    finally { observer.disconnect();w.positionBubble=position; }
  })()`);
  assert.deepEqual(idleRefresh, { layouts: 0, textMutations: 0 }, 'Unchanged ticks must skip bubble layout and text replacement');
  const layout = await page('Page.getLayoutMetrics');
  const overview = await page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: layout.cssContentSize.width, height: layout.cssContentSize.height, scale: 1 } });
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'artifacts/preview-overview.png'), Buffer.from(overview.data, 'base64'));
  const styleBounds=await evaluate(`(()=>{const r=document.querySelector('.style-review').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()`);
  const styleShot=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:styleBounds});
  fs.writeFileSync(path.join(root,`artifacts/style-review-${version.replaceAll('.','')}.png`),Buffer.from(styleShot.data,'base64'));
  const storyBounds = await evaluate(`(()=>{const r=document.querySelector('.meal-story').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()`);
  const storyShot = await page('Page.captureScreenshot', { format:'png', captureBeyondViewport:true, clip:storyBounds });
  fs.writeFileSync(path.join(root, `artifacts/style-and-motion-${version.replaceAll('.','')}.png`), Buffer.from(storyShot.data,'base64'));

  // The preview's external pose controls are not production menu controls.
  const assertFormalMenu = async () => {
    assert.deepEqual(await evaluate(`Array.from(previewPet.root.querySelectorAll('button'), node => node.className)`), ['pet-button', 'close', 'action reset', 'action hide', 'restore']);
    assert.equal(await evaluate(`previewPet.root.querySelectorAll('[class*="diagnostic"],[id*="diagnostic"],[data-action],.test-button,textarea').length`), 0);
    assert.equal(await evaluate(`/diagnostic|telemetry|clipboard|同步诊断|测试/.test(previewPet.panel.textContent)`), false);
    assert.equal(await evaluate(`Object.keys(previewPet).some(key => /diagnostic/i.test(key))`), false);
  };
  await assertFormalMenu();
  const base = { sessionId: 'offline-release', available: true, running: true, pending: false, workingCount: 2 };
  const snapshot = async (value, state) => {
    await evaluate(`previewSet(${JSON.stringify(value)})`);
    await evaluate(`(async()=>{const deadline=performance.now()+2000;while(previewPet.pet.dataset.transition){if(performance.now()>deadline)throw Error('motion route did not settle');await new Promise(requestAnimationFrame);}})()`);
    assert.equal(await evaluate(`previewPet.pet.dataset.state`), state);
    assert.equal(await evaluate(`previewPet.countOverlay.hasAttribute('hidden')`), state !== 'working');
    assert.ok(await evaluate(`previewPet.button.getAttribute('aria-label').length > 0`));
    // Sample the pose and DOM together so an animation frame cannot advance between reads.
    const { bounds, crop } = await evaluate(`(()=>{const style=previewPet.image.style;return {bounds:previewPet.motionDirector.lastPose.rect,crop:{left:parseFloat(style.left),top:parseFloat(style.top),width:parseFloat(style.width),height:parseFloat(style.height)}}})()`);
    for (const [key, expected] of Object.entries({top:-bounds[1]/bounds[3]*100,width:1254/bounds[2]*100,height:1254/bounds[3]*100})) assert.ok(Math.abs(crop[key]-expected)<0.001, `${state} crop ${key}`);
    if (!['resting','working'].includes(state)) assert.ok(Math.abs(crop.left + bounds[0]/bounds[2]*100)<0.001);
    assert.equal(await evaluate(`getComputedStyle(previewPet.image.parentElement).aspectRatio`), '1 / 1');
  };
  await snapshot(base, 'working');
  assert.equal(await evaluate(`previewPet.countText.textContent`), '2');
  await snapshot({ ...base, pending: true }, 'waiting');
  await snapshot({ ...base, workingCount: 1, notice: { id: 'partial-completion', reason: 'completed' } }, 'celebrate');
  // Normal completion while another task is still running retains the beta.3 behavior.
  await snapshot({ ...base, workingCount: 1 }, 'working');
  await snapshot({ ...base, notice: { id: 'failed-task', reason: 'error' } }, 'error');
  await snapshot(base, 'working');
  await snapshot({ ...base, running: false, workingCount: 0, outcome: { id: 'finished-task', reason: 'completed' } }, 'celebrate');
  await snapshot(base, 'working');
  await snapshot({ ...base, running: false, workingCount: 0, outcome: { id: 'aborted-task', reason: 'aborted' } }, 'resting');
  await evaluate(`clockOffset += previewPet.preferences.sleepAfterMs + 5000; previewPet.paint()`);
  assert.equal(await evaluate(`previewPet.pet.dataset.state`), 'sleeping');
  await evaluate(`previewPet.machine.touch(Date.now()+clockOffset);previewPet.paint()`);

  // Exercise real head-hold pointer delivery, then check distinct drawing frames.
  await evaluate(`previewPet.motion.checked=true;previewPet.motion.dispatchEvent(new Event('change'));previewPet.root.querySelector('.reset').click();previewPet.closePanel(false)`);
  const head = await evaluate(`(()=>{const r=previewPet.image.parentElement.getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.3}})()`);
  await page('Input.dispatchMouseEvent', { type:'mousePressed', x:head.x, y:head.y, button:'left', clickCount:1 });
  await evaluate(`new Promise(resolve=>setTimeout(resolve,780))`);
  assert.equal(await evaluate(`previewPet.pet.dataset.interaction`), 'headpat');
  await page('Input.dispatchMouseEvent', { type:'mouseReleased', x:head.x, y:head.y, button:'left', clickCount:1 });
  assert.equal(await evaluate(`previewPet.pet.dataset.interaction`), 'headpat');
  const patScreenshot = await page('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(root, 'artifacts/headpat.png'), Buffer.from(patScreenshot.data,'base64'));
  const frames = await evaluate(`(async()=>{const seen=new Set();for(let i=0;i<12;i++){seen.add(previewPet.pet.dataset.frame);await new Promise(resolve=>setTimeout(resolve,110));}return Array.from(seen);})()`);
  assert.ok(frames.length >= 3, 'head pat must change actual drawn frames');
  // A native quick click must select the new rice atlas rather than the old gesture.
  await page('Input.dispatchMouseEvent', { type:'mousePressed', x:head.x, y:head.y, button:'left', clickCount:1 });
  await page('Input.dispatchMouseEvent', { type:'mouseReleased', x:head.x, y:head.y, button:'left', clickCount:1 });
  assert.equal(await evaluate(`previewPet.pet.dataset.interaction`), 'eating');
  assert.equal(await evaluate(`previewPet.pet.dataset.transition ?? previewPet.pet.dataset.clip`), 'eating');
  assert.equal(await evaluate(`previewPet.image.src!==WhalePet.assets.eating`), true);
  await evaluate(`(async()=>{const deadline=performance.now()+3000;while(previewPet.pet.dataset.clip!=='eating'){if(performance.now()>deadline)throw Error('meal did not start');await new Promise(requestAnimationFrame);}})()`);
  assert.equal(await evaluate(`previewPet.pet.dataset.clip`), 'eating');
  assert.equal(await evaluate(`previewPet.image.src===WhalePet.assets.eating`), true);
  await evaluate(`previewPet.image.decode()`);
  const playback = await evaluate(`(async()=>{const seen=new Set(),opacity=new Set(),primary=new Set(),feet=[];let callbacks=0;const original=previewPet.renderAnimation;previewPet.renderAnimation=function(){callbacks++;return original.call(this);};const start=performance.now();await new Promise(resolve=>{function sample(){const frame=Number(previewPet.pet.dataset.frame);seen.add(frame);opacity.add(Number(previewPet.nextImage.style.opacity));primary.add(Number(previewPet.image.style.opacity));const r=previewPet.image.parentElement.getBoundingClientRect(),pose=WhalePet.FRAME_REGISTRATION.eating[frame],style=previewPet.image.style;feet.push([r.x+parseFloat(style.left)/100*r.width+pose.anchor[0]*parseFloat(style.width)/100*r.width/1254,r.y+parseFloat(style.top)/100*r.height+pose.anchor[1]*parseFloat(style.height)/100*r.height/1254]);if(performance.now()-start>=1800)resolve();else requestAnimationFrame(sample);}requestAnimationFrame(sample);});previewPet.renderAnimation=original;return {frames:Array.from(seen).sort((a,b)=>a-b),secondaryOpacity:Array.from(opacity),primaryOpacity:Array.from(primary),drift:[0,1].map(axis=>Math.max(...feet.map(p=>p[axis]))-Math.min(...feet.map(p=>p[axis]))),callbacks,duration:performance.now()-start};})()`);
  assert.deepEqual(playback.frames, Array.from({length:16},(_,i)=>i));
  assert.ok(playback.callbacks >= 45, 'render cadence must exceed the old 10 Hz timer');
  assert.deepEqual(playback.secondaryOpacity, [0], 'a second outline must never contribute');
  assert.deepEqual(playback.primaryOpacity, [1], 'drawn character must stay opaque');
  assert.ok(playback.drift.every(px=>px<0.05), 'projected shoe origin must stay in place across all sixteen frames');
  assert.ok(playback.callbacks/playback.duration*1000 <= 75, 'high-refresh screens must respect the 60Hz drawing cap');
  console.log(JSON.stringify({playback, observedRenderHz: Math.round(playback.callbacks/playback.duration*1000)}));
  assert.equal(await evaluate(`getComputedStyle(previewPet.image).mixBlendMode`), 'normal');
  assert.equal(await evaluate(`getComputedStyle(previewPet.image.parentElement).transform`), 'none');
  const mealStarted = await evaluate(`previewPet.interaction.started`);
  await page('Input.dispatchMouseEvent', { type:'mousePressed', x:head.x, y:head.y, button:'left', clickCount:1 });
  await page('Input.dispatchMouseEvent', { type:'mouseReleased', x:head.x, y:head.y, button:'left', clickCount:1 });
  assert.equal(await evaluate(`previewPet.interaction.started`), mealStarted);
  await evaluate(`window.savedPetNow=previewPet.now;const frozenNow=previewPet.now();previewPet.now=()=>frozenNow;previewPet.interaction.started=frozenNow-WhalePet.EATING_TIMING.down-865;previewPet.interaction.until=previewPet.interaction.started+WhalePet.EATING_TIMING.total;previewPet.motionDirector.phaseStarted=previewPet.interaction.started;previewPet.renderAnimation()`);
  assert.equal(await evaluate(`previewPet.pet.dataset.clip`), 'eating');
  await evaluate(`previewPet.image.decode().then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))`);
  const riceScreenshot = await page('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(root, 'artifacts/eating.png'), Buffer.from(riceScreenshot.data,'base64'));
  await evaluate(`previewPet.now=savedPetNow`);
  // Check the recovery and final idle phases through the actual widget clock.
  await evaluate(`window.savedPetNow=previewPet.now;const started=previewPet.interaction.started;previewPet.now=()=>started+5700;previewPet.renderAnimation()`);
  assert.equal(await evaluate(`previewPet.pet.dataset.clip`), 'eatingUp');
  await evaluate(`previewPet.now=()=>previewPet.interaction.started+5900;previewPet.renderAnimation()`);
  assert.equal(await evaluate(`previewPet.image.src===WhalePet.assets.transition`), true);
  await evaluate(`window.mealExpiry=previewPet.interaction.until;previewPet.now=()=>mealExpiry;previewPet.renderAnimation()`);
  assert.equal(await evaluate(`previewPet.pet.dataset.clip`), 'resting');
  assert.equal(await evaluate(`previewPet.pet.dataset.frame`), '3');
  assert.equal(await evaluate(`previewPet.image.src===WhalePet.assets.idle`), true);
  await evaluate(`previewPet.now=()=>mealExpiry+79;previewPet.renderAnimation()`);
  assert.equal(await evaluate(`previewPet.pet.dataset.frame`), '3');
  await evaluate(`previewPet.now=()=>mealExpiry+80;previewPet.renderAnimation()`);
  assert.equal(await evaluate(`previewPet.pet.dataset.frame`), '4');
  await evaluate(`previewPet.now=()=>mealExpiry+300;previewPet.renderAnimation()`);
  assert.equal(await evaluate(`previewPet.pet.dataset.frame`), '5');
  await evaluate(`previewPet.now=savedPetNow`);
  // Check actual CSS geometry on both sides of every action boundary,
  // including removal of the resting CSS animation when clicking to eat.
  const sequenceGeometry = await evaluate(`(()=>{const saved=previewPet.now,start=saved(),samples=[];previewPet.motionDirector.reset();previewPet.interaction={kind:'eating',started:start,until:start+WhalePet.EATING_TIMING.total};for(const elapsed of [0,65,120,450,899,900,965,1699,5699,5700,5765,6000,6399,6400,6480,6700]){previewPet.now=()=>start+elapsed;previewPet.renderAnimation();const clip=previewPet.pet.dataset.clip,frame=Number(previewPet.pet.dataset.frame),pose=previewPet.motionDirector.lastPose,r=previewPet.image.parentElement.getBoundingClientRect(),style=previewPet.image.style;samples.push({clip,elapsed,sourceCorrect:previewPet.image.src===WhalePet.assets[pose.assetKey],assetKey:pose.assetKey,sourceFrame:pose.sourceFrame??pose.frame,rect:pose.rect,viewport:[r.x,r.y,r.width,r.height],shoe:[r.x+parseFloat(style.left)/100*r.width+pose.anchor[0]*parseFloat(style.width)/100*r.width/1254,r.y+parseFloat(style.top)/100*r.height+pose.anchor[1]*parseFloat(style.height)/100*r.height/1254],transform:getComputedStyle(previewPet.image.parentElement).transform,opacity:[Number(style.opacity),Number(previewPet.nextImage.style.opacity)]});}previewPet.now=saved;previewPet.interaction=null;previewPet.paint();return samples;})()`);
  const handoff=sequenceGeometry.filter(sample=>[899,900,5700].includes(sample.elapsed));
  assert.equal(handoff.length,3);for(const sample of handoff){assert.equal(sample.assetKey,'eating');assert.equal(sample.sourceFrame,0);assert.deepEqual(sample.rect,handoff[0].rect);}
  for (const sample of sequenceGeometry) {
    assert.equal(sample.sourceCorrect,true,'each crop must display its matching source atlas');
    assert.equal(sample.transform, 'none'); assert.deepEqual(sample.opacity, [1,0]);
    for (let axis=0;axis<4;axis++) assert.ok(Math.abs(sample.viewport[axis]-sequenceGeometry[0].viewport[axis])<0.01, 'art viewport must stay fixed through complete action');
    for (let axis=0;axis<2;axis++) assert.ok(Math.abs(sample.shoe[axis]-sequenceGeometry[0].shoe[axis])<0.01, 'shoe origin must stay fixed through complete action');
  }
  await page('Emulation.setEmulatedMedia', { features:[{name:'prefers-reduced-motion',value:'reduce'}] });
  await evaluate(`new Promise(resolve=>setTimeout(resolve,150))`);
  assert.equal(await evaluate(`previewPet.pet.dataset.frame`), '0');
  assert.equal(await evaluate(`previewPet.frameRequest`), null);
  assert.equal(await evaluate(`previewPet.nextImage.style.opacity`), '0');
  await page('Emulation.setEmulatedMedia', { features:[{name:'prefers-reduced-motion',value:'no-preference'}] });
  await evaluate(`previewSet({sessionId:'offline-release',available:true,running:true,pending:true,workingCount:1})`);
  assert.equal(await evaluate(`previewPet.pet.dataset.interaction ?? null`), null);
  assert.equal(await evaluate(`previewPet.pet.dataset.state`), 'waiting');
  await evaluate(`(async()=>{while(previewPet.pet.dataset.transition)await new Promise(requestAnimationFrame);})()`);
  assert.equal(await evaluate(`previewPet.frameRequest`), null);
  await snapshot({ ...base, running:false, workingCount:0, pending:false }, 'resting');

  const matrixCheck = await evaluate(`(()=>{const w=previewPet,savedNow=w.now,savedView=w.machine.view,savedInteraction=w.interaction,actions=['resting','working','headpat','eating','waiting','celebrate','error','sleeping'];let checked=0;const samples=[];function setAction(action,time){w.now=()=>time;w.machine.view=()=>({state:['headpat','eating'].includes(action)?'resting':action,available:true,messageKey:'state.resting',workingCount:action==='working'?1:0});w.interaction=['headpat','eating'].includes(action)?{kind:action,started:time,until:time+100000}:null;w.paint();}function geometry(){const r=w.image.parentElement.getBoundingClientRect(),p=w.motionDirector.lastPose,s=w.image.style;return {viewport:[r.x,r.y,r.width,r.height],shoe:[r.x+parseFloat(s.left)/100*r.width+p.anchor[0]*parseFloat(s.width)/100*r.width/1254,r.y+parseFloat(s.top)/100*r.height+p.anchor[1]*parseFloat(s.height)/100*r.height/1254],opacity:[Number(s.opacity),Number(w.nextImage.style.opacity)],transform:getComputedStyle(w.image.parentElement).transform};}try{for(const from of actions)for(const to of actions)if(from!==to){w.motionDirector.reset();setAction(from,100000);w.now=()=>101500;w.paint();const origin=geometry();setAction(to,101501);const end=w.motionDirector.phaseStarted;for(const time of [101501,101531,101601,101751,end,end+80]){w.now=()=>Math.max(101501,time);w.paint();const g=geometry();for(let a=0;a<4;a++)if(Math.abs(g.viewport[a]-origin.viewport[a])>.01)throw Error(from+'->'+to+' viewport drift');for(let a=0;a<2;a++)if(Math.abs(g.shoe[a]-origin.shoe[a])>.01)throw Error(from+'->'+to+' shoe drift');if(g.opacity[0]!==1||g.opacity[1]!==0||g.transform!=='none')throw Error('ghost or unexpected transform');}if(w.motionDirector.action!==to)throw Error('incorrect destination');checked++;}return {pairs:checked,opaque:true,stableViewport:true,stableShoeOrigin:true};}finally{w.now=savedNow;w.machine.view=savedView;w.interaction=savedInteraction;w.motionDirector.reset();w.paint();}})()`);
  assert.equal(matrixCheck.pairs,56); console.log(JSON.stringify({transitionMatrix:matrixCheck}));
  const transitionBox = await evaluate(`(()=>{const r=document.querySelector('.all-transitions').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()`);
  const transitionShot=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:transitionBox});
  fs.writeFileSync(path.join(root,`artifacts/all-transitions-${version.replaceAll('.','')}.png`),Buffer.from(transitionShot.data,'base64'));

  // Exercise normal keyboard, context-menu and settings actions, without special runtime APIs.
  await page('Page.bringToFront');
  await evaluate(`previewPet.button.focus()`);
  assert.equal(await evaluate(`previewPet.root.activeElement === previewPet.button`), true);
  // Match native browser automation: Enter needs its carriage-return text to
  // produce keypress/default button activation; non-text keys use rawKeyDown.
  await page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
  await page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  assert.equal(await evaluate(`previewPet.panel.hidden`), false);
  assert.equal(await evaluate(`previewPet.root.activeElement === previewPet.root.querySelector('.close')`), true);
  await evaluate(`previewPet.scope.value='current';previewPet.scope.dispatchEvent(new Event('change'));previewPet.range.value='125';previewPet.range.dispatchEvent(new Event('input'));previewPet.motion.click();previewPet.sleep.value='30000';previewPet.sleep.dispatchEvent(new Event('change'));`);
  assert.deepEqual(await evaluate(`({scope:previewPet.preferences.scope,scale:previewPet.preferences.scale,motion:previewPet.preferences.motion,sleep:previewPet.machine.sleepAfterMs})`), { scope: 'current', scale: 1.25, motion: false, sleep: 30000 });
  await evaluate(`previewPet.root.querySelector('.hide').click()`);
  assert.deepEqual(await evaluate(`({hidden:previewPet.pet.hidden,restore:previewPet.restore.hidden,panel:previewPet.panel.hidden})`), { hidden: true, restore: false, panel: true });
  await evaluate(`previewPet.restore.click()`);
  assert.equal(await evaluate(`previewPet.pet.hidden`), false);
  const before = await evaluate(`previewPet.position.x`);
  await page('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  await page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  assert.equal(await evaluate(`previewPet.position.x`), before - 5);
  const drag = await evaluate(`(()=>{const rect=previewPet.button.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,left:previewPet.position.x,top:previewPet.position.y}})()`);
  await page('Input.dispatchMouseEvent', { type: 'mousePressed', x: drag.x, y: drag.y, button: 'left', clickCount: 1 });
  await page('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.x - 30, y: drag.y - 30, button: 'left', buttons: 1 });
  await page('Input.dispatchMouseEvent', { type: 'mouseReleased', x: drag.x - 30, y: drag.y - 30, button: 'left', clickCount: 1 });
  assert.deepEqual(await evaluate(`({x:previewPet.position.x,y:previewPet.position.y,dragging:previewPet.drag})`), { x: drag.left - 30, y: drag.top - 30, dragging: null });
  await evaluate(`previewPet.button.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));previewPet.root.querySelector('.reset').click();`);
  assert.equal(await evaluate(`previewPet.panel.hidden`), false);
  assert.deepEqual(await evaluate(`({x:previewPet.preferences.x,y:previewPet.preferences.y})`), { x: null, y: null });
  await page('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate(`previewPet.panel.hidden`), true);

  const bounds = async () => {
    const geometry = await evaluate(`(()=>{const p=previewPet.panel.getBoundingClientRect();return {left:p.left,top:p.top,right:p.right,bottom:p.bottom,width:innerWidth,height:innerHeight,scroll:getComputedStyle(previewPet.panel).overflowY}})()`);
    assert.ok(geometry.left >= 0 && geometry.top >= 0 && geometry.right <= geometry.width && geometry.bottom <= geometry.height, JSON.stringify(geometry));
    assert.equal(geometry.scroll, 'auto');
  };
  const settingsPlacement = await evaluate(`(()=>{const w=previewPet,saved={x:w.preferences.x,y:w.preferences.y,scale:w.preferences.scale},checks=[];try{for(const scale of [.65,1.05,1.6])for(const [x,y] of [[12,56],[innerWidth-190*scale-12,56],[12,innerHeight-190*scale-12],[innerWidth-190*scale-12,innerHeight-190*scale-12]]){Object.assign(w.preferences,{x,y,scale});w.applyPreferences();w.openPanel();const p=w.panel.getBoundingClientRect(),pet=w.pet.getBoundingClientRect();if(p.left<12-.01||p.top<56-.01||p.right>innerWidth-12+.01||p.bottom>innerHeight-12+.01)throw Error('panel outside viewport');if(!(p.right<=pet.left||p.left>=pet.right||p.bottom<=pet.top||p.top>=pet.bottom))throw Error('settings cover pet');if(getComputedStyle(w.bubble).visibility!=='hidden'||getComputedStyle(w.bubble).opacity!=='0')throw Error('settings must hide speech');w.closePanel(false);if(w.pet.dataset.panelOpen!==undefined||getComputedStyle(w.bubble).visibility==='hidden')throw Error('speech not restored');checks.push({scale,x,y});}return {positions:checks.length,visiblePet:true,hiddenSpeechWhileOpen:true};}finally{Object.assign(w.preferences,saved);w.applyPreferences();w.openPanel();}})()`);
  console.log(JSON.stringify({settingsPlacement}));
  for (const [language, dark] of [['zh', false], ['en', true]]) {
    await page('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
    await evaluate(`document.body.classList.toggle('dark',${dark});document.documentElement.style.colorScheme=${JSON.stringify(dark ? 'dark' : 'light')};previewPet.setLanguage(${JSON.stringify(language)});previewPet.openPanel();`);
    await assertFormalMenu(); await bounds();
    assert.equal(await evaluate(`previewPet.root.querySelector('[data-i18n="panel.title"]').textContent`), language === 'zh' ? '鲸鱼娘 · 陪你工作' : 'Your whale girl companion');
    assert.equal(await evaluate(`previewPet.panel.getAttribute('aria-label')`), language === 'zh' ? '鲸鱼娘设置' : 'Whale girl companion settings');
    const image = await page('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(root, `artifacts/release-ui-${language}.png`), Buffer.from(image.data, 'base64'));
  }
  await page('Emulation.setDeviceMetricsOverride', { width: 360, height: 480, deviceScaleFactor: 1, mobile: true });
  await evaluate(`previewPet.reposition();previewPet.positionPanel()`);
  await bounds(); await assertFormalMenu();
  await evaluate(`previewPet.root.querySelector('.close').click()`);
  assert.equal(await evaluate(`previewPet.panel.hidden`), true);
  await evaluate(`previewPet.dispose()`);
  assert.equal(await evaluate(`window.__clipboardCalls`), 0);
  assert.deepEqual(await evaluate(`window.__unhandled`), []);
  assert.deepEqual(exceptionEvents, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(networkRequests, []);
  console.log(JSON.stringify({ result: 'PASS', version, environment: 'isolated file:// preview, not live DSH', checks: ['no diagnostic/test menu controls', 'all 56 directed action pairs: actual DOM viewport, shoe coordinates, opaque single cel and rapid semantic changes; working/waiting/celebration/error snapshots', 'aborts do not celebrate', 'regular settings and hide/restore', 'keyboard menu/movement and pointer drag', '700ms head hold and release suppresses extra click', 'single opaque drawing and registered shoe origins through complete action boundaries; meal returns to active idle within 80ms', 'native click: preparation, eating, recovery, repeated-click continuity and task priority', 'system reduced motion freezes frames', 'Chinese/light and English/dark', '360x480 mobile menu bounds', 'no clipboard access', 'no network requests or runtime/unhandled errors'], screenshots: ['artifacts/preview-overview.png', 'artifacts/headpat.png', 'artifacts/eating.png', 'artifacts/release-ui-zh.png', 'artifacts/release-ui-en.png'] }, null, 2));
} catch (error) {
  console.error(chromeOutput);
  throw error;
} finally {
  for (const item of pending.values()) clearTimeout(item.timer);
  socket?.close();
  chrome.kill();
  if (chrome.pid && chrome.exitCode === null) await new Promise(resolve => { const timer = setTimeout(resolve, 3000); chrome.once('exit', () => { clearTimeout(timer); resolve(); }); });
  const tempRoot = path.resolve(os.tmpdir());
  if (!path.resolve(profile).startsWith(tempRoot + path.sep) || !path.basename(profile).startsWith('whale-release-check-')) throw Error('Refusing unexpected browser profile cleanup');
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Windows may briefly retain a browser file lock. */ }
}


import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const { version } = JSON.parse(read('package.json'));
const activeAtlases = JSON.parse(read('assets/active-atlases.json'));
// Independently authored geometric preview stand-in, not copied from DSH artwork.
// Production continues to render the official icon supplied by the live host.
const previewChevron = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="M 4 6 L 8 10 L 12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// One embedded PNG shared by all poses. Crop in CSS; preserve the generated alpha.
const png = fs.readFileSync(path.join(root, 'assets/whale-girl-atlas.png'));
if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== 1254 || png.readUInt32BE(20) !== 1254 || png[25] !== 6) throw Error('Expected the reviewed 1254×1254 RGBA atlas');
const spriteAtlas = `data:image/png;base64,${png.toString('base64')}`;
const animationPng = fs.readFileSync(path.join(root, 'assets/whale-girl-animation.png'));
if (animationPng.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || animationPng.readUInt32BE(16) !== 1254 || animationPng.readUInt32BE(20) !== 1254 || animationPng[25] !== 6) throw Error('Expected the reviewed transparent animation atlas');
const animationAtlas = `data:image/png;base64,${animationPng.toString('base64')}`;
const eatingPng = fs.readFileSync(path.join(root, `assets/${activeAtlases.eating}`));
if (eatingPng.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || eatingPng.readUInt32BE(16) !== 1254 || eatingPng.readUInt32BE(20) !== 1254 || eatingPng[25] !== 6) throw Error('Expected the reviewed 1254×1254 RGBA eating atlas');
const eatingAtlas = `data:image/png;base64,${eatingPng.toString('base64')}`;
const actionAtlases = {};
for (const [key, filename] of Object.entries(activeAtlases).filter(([key]) => key !== 'eating')) {
  const bytes = fs.readFileSync(path.join(root, `assets/${filename}`));
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== 1254 || bytes.readUInt32BE(20) !== 1254 || bytes[25] !== 6) throw Error(`Unexpected action atlas: ${filename}`);
  actionAtlases[key] = `data:image/png;base64,${bytes.toString('base64')}`;
}
const bubbleFonts = {};
for (const language of ['en', 'zh']) {
  const bytes = fs.readFileSync(path.join(root, `assets/fonts/bubble-${language}.woff2`));
  if (bytes.toString('ascii', 0, 4) !== 'wOF2') throw new Error(`Invalid embedded font: ${language}`);
  bubbleFonts[language] = `data:font/woff2;base64,${bytes.toString('base64')}`;
}
const fontLoader = read('src/fonts.js').replace(/^export /gm, '');
const bubblePosition = read('src/bubble-layout.js').replace(/^export /gm, '');
const bubbleSurface = read('src/bubble-surface.js').replace(/^export /gm, '');
const css = read('src/pet.css');
const i18n = read('src/i18n.js').replace(/^export /gm, '');
const state = read('src/state.js').replace(/^export /gm, '');
const globalState = read('src/global-state.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const widget = read('src/widget.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const adapter = read('src/adapter.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const registration = read('src/registration.js').replace(/^export /gm, '');
const sprite = read('src/sprites.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const animation = read('src/animation.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const motion = read('src/motion.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const common = `const SPRITE_ATLAS=${JSON.stringify(spriteAtlas)};\nconst ASSETS=Object.fromEntries(['working','celebrate','waiting','resting','sleeping','error'].map(state=>[state,SPRITE_ATLAS]));\nASSETS.animation=${JSON.stringify(animationAtlas)};\nASSETS.eating=${JSON.stringify(eatingAtlas)};\nObject.assign(ASSETS,${JSON.stringify(actionAtlases)});\nconst CSS=${JSON.stringify(css)};\nconst BUBBLE_FONTS=${JSON.stringify(bubbleFonts)};\n${registration}\n${sprite}\n${animation}\n${motion}\n${i18n}\n${state}\n${globalState}\n${fontLoader}\n${bubblePosition}\n${bubbleSurface}\n${widget}\n`;
fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
fs.mkdirSync(path.join(root, 'preview'), { recursive: true });
if (!process.argv.includes('--preview-only')) {
  const bridge = read('src/bridge-client.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const remote = read('lib/remote.js');
  const exportsBlock = /\nexport \{([^}]+)\};?\s*$/;
  const expectedExports = ['TYPERT_REMOTE', 'WHALE_FRAME_SCHEMA', 'WHALE_WATCH_DESCRIPTOR'];
  const exportedNames = remote.match(exportsBlock)?.[1].split(',').map(name => name.trim()).filter(Boolean).sort();
  if (JSON.stringify(exportedNames) !== JSON.stringify(expectedExports)) throw new Error('Unexpected bridge contract exports; refusing a broken bundle');
  const contract = `const WhaleBridgeContract=(()=>{${remote.replace(exportsBlock, '')}\nreturn {${expectedExports.join(',')}};})();`;
  fs.writeFileSync(path.join(root, 'lib/index.js'), read('src/host-bridge.js'));
  fs.writeFileSync(path.join(root, 'lib/client.js'), `// Generated by tools/build.mjs. Uses the existing authenticated DSH connection only.\nwindow.__ModuleLoader__.load({id:'dsh-plugin-whale-girl',factory:function(require){\n'use strict';\n${common}\n${contract}\n${bridge}\n${adapter}\nreturn createPlugin(require, ASSETS, CSS, BUBBLE_FONTS);\n}});\n`);
}
fs.writeFileSync(path.join(root, 'preview/runtime.js'), `// Generated from the same UI and state machine as the DSH plugin.\n(function(){'use strict';\n${common}\nwindow.WhalePet={WhaleWidget,PetStateMachine,SessionAggregate,STATES,MotionDirector,actionPose,applyAnimationPose,FRAME_REGISTRATION,SPRITE_RECTS,applySprite,applyAnimationFrame,animationFrame,eatingStage,EATING_TIMING,assets:ASSETS,css:CSS,fonts:BUBBLE_FONTS,previewChevron:${JSON.stringify(previewChevron)}};\n})();\n`);
// Single-file preview works offline and in a browser with file://, no dev server required.
const html = read('src/preview.html')
  .replaceAll('__PACKAGE_VERSION__', version)
  .replace('/*__RUNTIME__*/', fs.readFileSync(path.join(root, 'preview/runtime.js'), 'utf8').replace(/<\/script/gi, '<\\/script'));
fs.writeFileSync(path.join(root, 'preview/index.html'), html);
console.log('Built native client and offline preview: single opaque drawing, registered shoe anchors, fixed square viewport, silent interactions.');

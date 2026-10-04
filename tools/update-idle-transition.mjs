import fs from 'node:fs';
const edit = (file, replace) => fs.writeFileSync(file, replace(fs.readFileSync(file, 'utf8')));
edit('tools/build.mjs', s => s.replace('\\nconst CSS=', '\\nObject.assign(ASSETS,${JSON.stringify(actionAtlases)});\\nconst CSS=')
 .replace('applySprite,applyAnimationFrame,assets:ASSETS', 'applySprite,applyAnimationFrame,animationFrame,eatingStage,EATING_TIMING,assets:ASSETS')
 .replace('sixteen eating frames, silent interactions', 'sixteen idle drawings, meal preparation and recovery, silent interactions'));
edit('package.json', s => s.replace('"version": "0.3.2"', '"version": "0.4.0"'));
edit('tests/package.test.mjs', s => s.replace("manifest.version, '0.3.2'", "manifest.version, '0.4.0'"));
edit('src/preview.html', s => s.replace('28 DRAWN FRAMES', '56 ACTIVE DRAWN FRAMES')
 .replace("['resting','待机眨眼','四帧眨眼与柔和过渡']", "['resting','自然待机','眨眼、张望、歪头与挥手']")
 .replace("['eating','蹲下吃米饭','16 帧连续动作 · 单击或 C']", "['eating','蹲下吃米饭','16 帧吃饭 · 单击看完整过渡'],['eatingDown','端碗蹲下','8 帧准备动作'],['eatingUp','起身放碗','8 帧收尾动作']")
 .replace("clip==='eating'?WhalePet.assets.eating:WhalePet.assets.animation", "clip==='resting'?WhalePet.assets.idle:clip==='eating'?WhalePet.assets.eating:clip.startsWith('eating')?WhalePet.assets.transition:WhalePet.assets.animation")
 .replace("WhalePet.applyAnimationFrame(image,clip,Date.now()-demoStart,paused,nextImage)", "WhalePet.applyAnimationFrame(image,clip,clip==='eatingDown'||clip==='eatingUp'?(Date.now()-demoStart)%2000:Date.now()-demoStart,paused,nextImage)")
 .replace('.animation-demos{display:grid;grid-template-columns:repeat(4,1fr)', '.animation-demos{display:grid;grid-template-columns:repeat(3,1fr)'));

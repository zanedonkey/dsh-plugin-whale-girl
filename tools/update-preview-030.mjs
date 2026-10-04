import fs from 'node:fs';
const file = new URL('../src/preview.html', import.meta.url);
let html = fs.readFileSync(file, 'utf8');
if (!html.includes('animation-demos')) {
  html = html.replace('</style>', '.animation-demos{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}.animation-card{display:flex;flex-direction:column;align-items:center;border:1px solid var(--line);border-radius:14px;padding:15px;background:var(--card)}.animation-card .atlas-frame{height:145px}.animation-card strong{font-size:12px;font-weight:550}.animation-card small{font-size:10px;color:var(--muted);margin-top:6px}@media(max-width:760px){.animation-demos{grid-template-columns:repeat(2,1fr)}}</style>');
  html = html.replace('<p class="notice">', '<div class="collection-head"><h2>眨眨眼，再摸摸头</h2><span>16 DRAWN ANIMATION FRAMES · SILENT</span></div><div class="animation-demos"></div><p class="notice">');
  html = html.replace('<button class="test-button" data-action="error">任务失败</button>', '<button class="test-button" data-action="error">任务失败</button><button class="test-button" data-action="pat">摸摸头 ♡</button><button class="test-button" data-action="coquetry">撒个娇 ♡</button>');
  html = html.replace('点击打招呼，右键打开小设置。', '单击撒娇，长按头部 0.7 秒摸头。<br>P 摸头 · C 撒娇 · 右键设置。');
  html = html.replace('模拟完成才会欢呼；中止不会。', '闲置时试试摸头、撒娇；工作状态优先。<br>模拟完成才会欢呼；中止不会。');
  html = html.replace(" const action=b.dataset.action;", " const action=b.dataset.action;\n if(action==='pat'||action==='coquetry'){pet.interact(action==='pat'?'headpat':'coquetry');return;} ");
  html = html.replace('// Preview-only driver for browser tests;', `const demoStart=Date.now();
const animationDemos=[['resting','待机眨眼','四帧眨眼循环'],['working','抱电脑打字','手指与表情逐帧变化'],['headpat','摸摸头','长按头部 0.7 秒'],['coquetry','撒个娇','单击，或按 C']].map(([clip,label,hint])=>{const card=document.createElement('div');card.className='animation-card';card.innerHTML='<span class="atlas-frame"><img alt="'+label+'"></span><strong>'+label+'</strong><small>'+hint+'</small>';const image=card.querySelector('img');image.src=WhalePet.assets.animation;WhalePet.applyAnimationFrame(image,clip,0);document.querySelector('.animation-demos').append(card);return {clip,image};});
setInterval(()=>{if(document.hidden)return;const paused=matchMedia('(prefers-reduced-motion: reduce)').matches;for(const {clip,image} of animationDemos)WhalePet.applyAnimationFrame(image,clip,Date.now()-demoStart,paused);},100);
// Preview-only driver for browser tests;`);
  fs.writeFileSync(file, html);
}
console.log('0.3.0 preview includes drawn animation demos and silent interactions.');

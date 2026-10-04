import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const edit = (file, fn) => { const p = new URL(file, root); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
edit('src/preview.html', s => s
  .replaceAll('Whale Companion', 'Whale Girl Companion')
  .replaceAll('WHALE COMPANION', 'WHALE GIRL')
  .replace('一只鲸鱼娘，六种小心情。', '蓝发、女仆裙，还有一条小鲸尾。')
  .replace('让它陪你走一轮', '让她陪你走一轮')
  .replace('你的角色素材 · SVG 无损缩放', '你的鲸鱼娘 · 透明角色素材')
  .replace('WHALE STICKERS © DEEPSEEK · PERSONAL PROJECT', 'WHALE GIRL · DSH NATIVE PLUGIN')
  .replace('<img class="hero-img" alt="休息中的鲸鱼娘">', '<span class="atlas-frame hero-frame"><img class="hero-img" alt="休息中的鲸鱼娘"></span>')
  .replace("document.querySelector('.hero-img').src=WhalePet.assets[state];", "document.querySelector('.hero-img').src=WhalePet.assets[state];WhalePet.applySprite(document.querySelector('.hero-img'),state);")
  .replace("<img alt=\"\" src=\"'+WhalePet.assets[p[0]]+'\">", "<span class=\"atlas-frame\"><img alt=\"\" src=\"'+WhalePet.assets[p[0]]+'\"></span>")
  .replace("document.querySelector('.poses').append(b);", "document.querySelector('.poses').append(b);WhalePet.applySprite(b.querySelector('img'),p[0]);")
  .replace('</style>', `.atlas-frame{display:block;position:relative;overflow:hidden;height:104px;width:auto;aspect-ratio:418/648;margin-bottom:10px}.atlas-frame img{position:absolute;display:block;max-width:none;object-fit:fill;margin:0;animation:none;filter:none}.hero-frame{height:174px;margin:0;filter:drop-shadow(0 7px 2px #425e8011);transform-origin:center bottom;animation:float 4s ease-in-out infinite}.hero-wrap{width:200px;height:184px}.hero-wrap .hero-frame img{animation:none}.stage{min-height:374px}.pose{min-height:164px}@media(prefers-reduced-motion:reduce){.hero-frame{animation:none}}</style>`));
edit('src/i18n.js', s => s.replaceAll('鲸鱼娘开工啦！', '开工啦！'));
edit('tests/working.test.mjs', s => s.replaceAll('鲸鱼娘开工啦！', '开工啦！'));
// Package icon metadata uses system UI fonts; the existing bubble subset stays complete.
edit('src/i18n.js', s => s.replaceAll('Tuck whale away', 'Tuck her away').replaceAll('Bring back my whale', 'Bring back whale girl').replaceAll('收起鲸鱼', '收起鲸鱼娘'));
console.log('Customized whale girl preview and copy.');

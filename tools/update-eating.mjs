import fs from 'node:fs';
const edit = (file, replace) => fs.writeFileSync(file, replace(fs.readFileSync(file, 'utf8')));
edit('package.json', s => s.replace('"version": "0.3.0"', '"version": "0.3.1"'));
edit('tests/package.test.mjs', s => s.replace("manifest.version, '0.3.0'", "manifest.version, '0.3.1'"));
edit('src/i18n.js', s => s.replaceAll('coquetry', 'eating')
 .replace('Click to say hello', 'Click to eat rice')
 .replace('press C for a playful gesture', 'press C to eat rice')
 .replaceAll('点击撒娇', '点击蹲下吃饭').replaceAll('C 撒娇', 'C 吃饭')
 .replace('You found me! Hehe~', 'Rice time! Nom nom~')
 .replace('Stay with me a little longer?', 'This rice is so yummy!')
 .replace('Saving a little smile for you~', 'A little rice before more work~')
 .replace('被你发现啦，嘿嘿～', '开饭啦，啊呜～')
 .replace('再陪我一小会儿嘛～', '米饭香香的！')
 .replace('送你一个小小的笑脸～', '先吃饱，再继续努力～'));
edit('src/preview.html', s => s.replaceAll('coquetry', 'eating').replaceAll('撒娇', '吃饭')
 .replaceAll('撒个娇', '蹲下吃米饭').replace('蹲下吃米饭 ♡', '蹲下吃米饭 🍚')
 .replace('image.src=WhalePet.assets.animation;', "image.src=clip==='eating'?WhalePet.assets.eating:WhalePet.assets.animation;"));
edit('tests/release-ui.test.mjs', s => s.replaceAll('coquetry', 'eating').replace('now = 3900;', 'now = 5800;'));
edit('tools/build.mjs', s => s.replace('const bubbleFonts = {};', `const eatingPng = fs.readFileSync(path.join(root, 'assets/whale-girl-eating.png'));
if (eatingPng.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || eatingPng.readUInt32BE(16) !== 1254 || eatingPng.readUInt32BE(20) !== 1254 || eatingPng[25] !== 6) throw Error('Expected the reviewed 1254×1254 RGBA eating atlas');
const eatingAtlas = \`data:image/png;base64,\${eatingPng.toString('base64')}\`;
const bubbleFonts = {};`)
 .replace('\\nconst CSS=', '\\nASSETS.eating=${JSON.stringify(eatingAtlas)};\\nconst CSS=')
 .replace('silent head-pat/coquetry interactions', 'silent head-pat/rice-eating interactions'));
edit('README.md', s => s.replaceAll('0.3.0', '0.3.1').replaceAll('撒娇', '吃饭')
 .replace('拖动搬家，单击吃饭', '拖动搬家，单击后蹲在地上端碗吃米饭')
 .replace('互动持续约 2.8 秒', '摸头持续约 2.8 秒，吃饭循环持续约 4.8 秒')
 .replace('`assets/whale-girl-animation.png` 是新动画图集；', '`assets/whale-girl-animation.png` 保存眨眼、打字与摸头动画；`assets/whale-girl-eating.png` 保存四帧吃米饭动画；')
 .replace('197 项', '199 项').replace('验证长按与帧切换', '验证长按、单击吃饭与帧切换'));
edit('CHANGELOG.md', s => `# 0.3.1\n\n- 单击与 C 键改为蹲在地上端碗吃米饭：夹饭、送入口、吃饭、咀嚼四帧循环，持续 4.8 秒。\n- 长按头部／P 键仍为摸头；吃饭不显示摸头爱心。\n- 新米饭图集完整嵌入客户端，保持静音、减少动画支持与真实任务状态优先。\n\n${s}`);
edit('ASSETS-LICENSE.md', s => s + '\n`assets/whale-girl-eating.png` 使用用户角色参考图与内置 imagegen 制作，包含四帧蹲地端碗吃米饭动作。保持生成图片原始透明通道，完整提示词见 `assets/eating-prompt.txt`。\n');
edit('assets/GENERATION.md', s => s + '\n## 0.3.1 吃米饭互动\n\n文件：`whale-girl-eating.png`，内置 imagegen，1254 × 1254 RGBA，2 × 2 四帧。\n输入：用户角色四视图；动作：蹲在地上端碗，夹米饭、送到嘴边、吃一口、咀嚼。\n生成文件：`exec-5ef7c242-1c78-4075-b594-d508e3133e58.png`，复制入项目并保留原始透明像素。\n完整提示词见 `eating-prompt.txt`，裁切坐标见 `src/animation.js`。该动作替换原单击撒娇互动。\n');

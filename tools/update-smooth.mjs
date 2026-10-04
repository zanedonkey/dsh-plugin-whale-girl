import fs from 'node:fs';
const edit = (file, replace) => fs.writeFileSync(file, replace(fs.readFileSync(file, 'utf8')));
edit('package.json', s => s.replace('"version": "0.3.1"', '"version": "0.3.2"'));
edit('tests/package.test.mjs', s => s.replace("manifest.version, '0.3.1'", "manifest.version, '0.3.2'"));
edit('src/preview.html', s => s.replace('</style></head>', '.animation-card .atlas-frame{isolation:isolate}.animation-card img{mix-blend-mode:plus-lighter}.demo-next{opacity:0}</style></head>'));
edit('README.md', s => s.replaceAll('0.3.1', '0.3.2')
 .replace('增加 **16 张独立绘制的动画帧、四组循环**', '使用 **28 张独立绘制的动画帧、四组循环**（其中吃饭 16 帧）')
 .replace('关闭“轻柔动画”', '播放改用屏幕同步刷新（常见屏幕约 60 Hz），相邻动作短暂混合过渡；吃饭动作图每秒 10 张，1.6 秒一轮。刷新率与动作图数量分别影响流畅度，实际刷新随设备而定。\n关闭“轻柔动画”')
 .replace('`assets/whale-girl-eating.png` 保存四帧吃米饭动画', '`assets/whale-girl-eating-smooth.png` 保存 16 帧吃米饭动画（原四帧素材保留）')
 .replace('199 项', '203 项').replace('单击吃饭与帧切换', '单击吃饭、16 帧循环、混合过渡与屏幕同步刷新')
 .replace('动画帧切换和减少动画设置', '动画帧切换、单一刷新回调、隐藏／拖动／卸载停止刷新和减少动画设置'));
edit('CHANGELOG.md', s => `# 0.3.2\n\n- 替换 100ms 播放检查定时器，使用屏幕同步刷新；常见屏幕约 60Hz，动作速度独立于刷新率。\n- 吃米饭从 4 帧补到 16 帧，保持 1.6 秒一轮与 4.8 秒互动时长。\n- 眨眼、打字、摸头与吃饭加入短时混合过渡；缓存裁切样式，减少重复写入。\n- 隐藏、减少动画、关闭动画、拖动与卸载停止刷新；静态任务姿态不占用刷新循环。\n\n${s}`);
edit('assets/GENERATION.md', s => s + '\n## 0.3.2 流畅吃饭动画\n\n文件：`whale-girl-eating-smooth.png`，内置 imagegen，1254 × 1254 RGBA，4 × 4 共 16 帧。\n输入：0.3.1 四帧吃饭图集；补充夹饭、抬手、送入口、收筷、咀嚼、放回碗的中间动作。\n生成文件：`exec-ae03adb2-b695-4e02-b4f0-e333b1c6e9d2.png`。复制入项目，保留透明像素；没有重绘或后处理生成结果。\n完整提示词见 `eating-smooth-prompt.txt`；运行时裁切、短时混合过渡，尊重减少动画设置。\n');
edit('ASSETS-LICENSE.md', s => s + '\n`assets/whale-girl-eating-smooth.png` 使用内置 imagegen 基于已批准的四帧吃饭图集生成 16 帧中间动作。提示词见 `assets/eating-smooth-prompt.txt`，透明像素保持原样。\n');

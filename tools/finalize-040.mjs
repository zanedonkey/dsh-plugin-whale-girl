import fs from 'node:fs';
const edit = (file, replace) => fs.writeFileSync(file, replace(fs.readFileSync(file, 'utf8')));
edit('README.md', s => s.replaceAll('0.3.2', '0.4.0').replace('204 项', '209 项')
 .replace('吃饭循环持续约 4.8 秒', '吃饭循环约 4.8 秒，前后各有约 0.9 秒准备／收尾动作（总计约 6.6 秒）')
 .replace('微笑站立、逐帧眨眼、轻轻呼吸', '微笑站立、眨眼、左右张望、歪头、小幅挥手与轻轻呼吸')
 .replace('**28 张独立绘制的动画帧、四组循环**（其中吃饭 16 帧）：待机眨眼、工作打字、摸头、吃饭。', '**56 张正在使用的动作帧**：16 帧自然待机、16 帧吃饭、8 帧端碗蹲下、8 帧起身放碗，以及打字／摸头各 4 帧。')
 .replace('等待、庆祝、报错和睡觉', '单击按“待机 → 端碗蹲下 → 吃饭 → 起身放碗 → 待机”播放；动作边界约 180ms 混合衔接，连续点击不会重新站起。\n新版待机与过渡以用户指定的吃饭图为画风基准，统一脸型、眼睛和阴影。\n等待、庆祝、报错和睡觉')
 .replace('下方有四组连续动画展示', '下方有六组动画和完整吃饭动作顺序展示')
 .replace('`assets/whale-girl-animation.png` 保存眨眼、打字与摸头动画；', '`assets/whale-girl-idle-unified.png` 保存新待机；`assets/whale-girl-meal-transition-unified.png` 保存蹲下／起身；`assets/whale-girl-animation.png` 保存打字与摸头动画；')
 .replace('混合过渡与屏幕同步刷新', '混合过渡、準备／收尾、重复点击不重启和屏幕同步刷新'));
edit('CHANGELOG.md', s => '# 0.4.0\n\n- 待机新增眨眼、左右张望、歪头和小幅挥手；动作间保留安静停顿。\n- 重绘待机与过渡，以用户指定的吃饭图作为画风基准。\n- 单击完整播放端碗蹲下、吃饭、起身放碗与待机；脚部对齐，动作边界用 180ms 混合衔接。\n- 重复点击继续当前动作；真实任务优先、减少动画与静音保持。\n\n' + s);
edit('assets/GENERATION.md', s => s + '\n## 0.4.0 自然待机与完整过渡\n\n工具：内置 imagegen，1254 × 1254 RGBA，保留原始透明像素，运行时裁切与混合播放。\n最初的待机与过渡在用户指出画风差异后重绘，旧候选不参与运行时显示。\n画风基准：用户重新发出的已批准吃饭图（`whale-girl-eating-smooth.png`）。\n\n- 最终待机：`whale-girl-idle-unified.png`，16 帧；生成文件 `exec-4328caf0-a645-43d8-aae8-ca7897ad9d03.png`；提示词 `idle-unified-prompt.txt`。\n- 最终过渡：`whale-girl-meal-transition-unified.png`，16 帧（蹲下 8、起身 8）；生成文件 `exec-53a98929-94e9-4068-be14-cf7d31c91be9.png`；提示词 `meal-transition-unified-prompt.txt`。\n- 过渡图输入最终待机与已批准吃饭图，保持相同眼睛、脸型、发色、线条及阴影。各帧按脚部基线对齐，独立裁切遮罩保护整个人物。\n');
edit('ASSETS-LICENSE.md', s => s + '\n0.4.0 使用 `assets/whale-girl-idle-unified.png` 与 `assets/whale-girl-meal-transition-unified.png`，均以用户指定的吃饭图为基准使用内置 imagegen 生成；完整提示词见 `assets/idle-unified-prompt.txt` 与 `assets/meal-transition-unified-prompt.txt`。生成图片像素和透明通道保持原样。\n');
edit('tools/release-browser-check.mjs', s => s.replace('native rice-eating click and task priority', 'native click: preparation, eating, recovery, repeated-click continuity and task priority').replace('distinct drawing frames advance', 'sixteen idle drawings, sixteen rice drawings and smooth action boundaries'));

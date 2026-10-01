# 素材生成记录

工具：内置 imagegen；输入：用户提供的四视图；输出：透明 RGBA PNG，1254 × 1254。

提示词要点：保持蓝色渐变长发、呆毛、白色女仆头饰与蓝蝴蝶结、蓝眼睛、深蓝女仆裙、白色鲸鱼围裙、白袜、深蓝鞋、大鲸尾；制作三列两行的六姿态透明图集，依次为待机、抱笔记本工作、歪头等待、举手庆祝、担心出错、闭眼坐着睡觉。手绘日系 Q 版风格，保持人物一致；完整呈现头饰、脚与尾巴；无文字、无背景、无水印。

完整提示词存于 `generation-prompt.txt`。图集保持工具输出原样，运行时按 `src/sprites.js` 的边界显示各姿态。

## 0.3.0 连续动画

文件：`whale-girl-animation.png`，内置 imagegen，1254 × 1254 RGBA，16 张独立绘制的动画帧。
输入：用户四视图和 0.2.0 角色图集；四行动作分别为眨眼、打字、摸头和撒娇。
为完整呈现呆毛、脚和尾巴，追加一次编辑，缩小各角色并增加透明间距。
提示词记录见 `animation-prompt.txt`，运行时按 `src/animation.js` 裁切，保持图片原始透明通道。

## 0.3.1 吃米饭互动

文件：`whale-girl-eating.png`，内置 imagegen，1254 × 1254 RGBA，2 × 2 四帧。
输入：用户角色四视图；动作：蹲在地上端碗，夹米饭、送到嘴边、吃一口、咀嚼。
生成文件：`exec-5ef7c242-1c78-4075-b594-d508e3133e58.png`，复制入项目并保留原始透明像素。
完整提示词见 `eating-prompt.txt`，裁切坐标见 `src/animation.js`。该动作替换原单击撒娇互动。

## 0.3.2 流畅吃饭动画

文件：`whale-girl-eating-smooth.png`，内置 imagegen，1254 × 1254 RGBA，4 × 4 共 16 帧。
输入：0.3.1 四帧吃饭图集；补充夹饭、抬手、送入口、收筷、咀嚼、放回碗的中间动作。
生成文件：`exec-ae03adb2-b695-4e02-b4f0-e333b1c6e9d2.png`。复制入项目，保留透明像素；没有重绘或后处理生成结果。
完整提示词见 `eating-smooth-prompt.txt`；运行时裁切、短时混合过渡，尊重减少动画设置。

## 0.4.0 自然待机与完整过渡

工具：内置 imagegen，1254 × 1254 RGBA，保留原始透明像素，运行时裁切与混合播放。
最初的待机与过渡在用户指出画风差异后重绘，旧候选不参与运行时显示。
画风基准：用户重新发出的已批准吃饭图（`whale-girl-eating-smooth.png`）。

- 最终待机：`whale-girl-idle-unified.png`，16 帧；生成文件 `exec-4328caf0-a645-43d8-aae8-ca7897ad9d03.png`；提示词 `idle-unified-prompt.txt`。
- 最终过渡：`whale-girl-meal-transition-unified.png`，16 帧（蹲下 8、起身 8）；生成文件 `exec-53a98929-94e9-4068-be14-cf7d31c91be9.png`；提示词 `meal-transition-unified-prompt.txt`。
- 过渡图输入最终待机与已批准吃饭图，保持相同眼睛、脸型、发色、线条及阴影。各帧按脚部基线对齐，独立裁切遮罩保护整个人物。

## 0.5.0 全部动作衔接

工具：内置 imagegen，两张 1254 × 1254 RGBA 图集，各含 4 × 4 共 16 张姿态。生成图片与透明像素保持原样；运行时裁切、统一鞋底位置，单张不透明播放。

- `whale-girl-actions-050.png`：输入已批准的吃饭图与最终待机。四行分别为抱电脑进入、摸头进入、等待进入与庆祝进入。生成文件 `exec-bf091b93-00e3-45d6-a314-0ff57e524e63.png`；完整提示词见 `actions-050-prompt.txt`。
- `whale-girl-expressions-050.png`：输入上一张新动作图、最终待机和已批准的吃饭图。四行分别为担心报错进入、坐下入睡、打字循环与摸头循环。生成文件 `exec-787a2f53-75dc-42ec-b29a-467adaeb9b42.png`；完整提示词见 `expressions-050-prompt.txt`。
- 进入姿态反向播放用于收尾，重复的中性起始图由统一待机姿态替代。`src/motion.js` 从当前显示的姿态规划衔接，`src/registration.js` 保存裁切与鞋底基准。

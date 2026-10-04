# 角色素材说明

`assets/character-reference.png` 是用户提供的鲸鱼娘参考图。
`assets/whale-girl-atlas.png` 使用内置 imagegen 工具，根据该参考图生成，保留透明通道。
`assets/whale-girl-animation.png` 同样使用内置 imagegen 制作并校正间距，包含 16 张动画帧；运行时裁切播放，未修改生成图的像素。
角色图的权利与使用范围由参考图权利人及适用生成服务条款决定；代码的 MIT 授权不授予参考图的权利。

本插件没有采用参考插件的 DeepSeek 鲸鱼贴纸。`assets/icon.svg` 是本项目绘制的简洁鲸尾图标。
字体授权见 `FONT-LICENSES.md` 和 `assets/fonts/`。

源代码框架改编自 Yifffan/dsh-plugin-whale-pet 0.2.9，提交
`6efec117faa6b677cc9e1f5305bc547352c54065`。原 MIT 版权声明保留在 `LICENSE`。

`assets/whale-girl-eating.png` 使用用户角色参考图与内置 imagegen 制作，包含四帧蹲地端碗吃米饭动作。保持生成图片原始透明通道，完整提示词见 `assets/eating-prompt.txt`。

`assets/whale-girl-eating-smooth.png` 使用内置 imagegen 基于已批准的四帧吃饭图集生成 16 帧中间动作。提示词见 `assets/eating-smooth-prompt.txt`，透明像素保持原样。

0.4.0 使用 `assets/whale-girl-idle-unified.png` 与 `assets/whale-girl-meal-transition-unified.png`，均以用户指定的吃饭图为基准使用内置 imagegen 生成；完整提示词见 `assets/idle-unified-prompt.txt` 与 `assets/meal-transition-unified-prompt.txt`。生成图片像素和透明通道保持原样。

0.5.0 新增 `assets/whale-girl-actions-050.png` 与 `assets/whale-girl-expressions-050.png`，使用内置 imagegen 参考已批准的吃饭图、最终待机及新动作图生成，共 32 张姿态。完整提示词见 `assets/actions-050-prompt.txt` 与 `assets/expressions-050-prompt.txt`；图片像素和透明通道保持原样，运行时裁切播放。

0.5.4 使用内置 imagegen 的参考图编辑模式重绘四张 `assets/*-054.png` 图集，以已批准的吃饭图为画风与角色基准。原始生成文件、参考图角色与完整提示词记录见 `assets/style-054-prompts.json`。原 PNG 像素与透明通道保留，运行时裁切与定位；首版待机候选仅作为草稿存于开发 artifacts，不参与运行或安装包。

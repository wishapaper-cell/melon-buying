# 场景对象视觉资产约定

当前正式画面使用 `public/assets/generated/melon-street-8bit.png` 场景位图，
不再通过 SVG 或 CSS 几何图形绘制物品。`HOVER`、`FOCUSED` 和可交互提示由
透明热点、像素提示点及标签完成。

每个目录的 `object.json` 只负责稳定 ID、状态、锚点和动作能力声明；它们不是
视觉素材，也不会在浏览器里生成图像。

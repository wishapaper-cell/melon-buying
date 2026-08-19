# 《华强买瓜：无限世界线》

一个面向 B 站直播的实时互动像素游戏纵向切片。正式场景中的物品都是独立实体，
拥有稳定 ID、视觉状态、动作能力、局部记忆和持久化世界状态。

当前视觉层使用实际生成并量化的 8-bit 2.5D 像素位图：16×12 等距逻辑场景、
玩家 16 帧行走（左右各 8 帧）与 4 帧待机、
瓜摊老板和神经质旅客双朝向 NPC，以及木质 UI 图集。WASD/方向键沿等距轴移动，
家具与 NPC 会阻挡移动，人物与场景物件按网格深度动态排序。

## 已实现的闭环

```text
靠近或点击物品
→ HOVER / FOCUSED 交互态
→ 读取完整世界上下文
→ 生成并校验 A、B、C、D
→ 收集 #提案 并归纳 E
→ A～E 弹幕投票
→ 规则系统结算行动
→ 更新物品、事实、关系与冲突强度
→ 生成 1～4 句实时短对话
→ 根据新状态继续下一轮
```

第一章经典路线只固定了需求附件明确提供的内容：

- `price_question` 节点的经典 A 选项；
- 原文台词 `What’s up，这瓜皮子是金子做的还是这瓜粒子是金子做的`。

选择 B、C、D 或 E 后会立即标记为偏离经典路线。其他分支没有预写完整对话。

## 本地运行

要求 Python 3.11+ 与 Node.js 22+。

```powershell
python -m pip install -r requirements.txt
npm install
Copy-Item .env.example .env
python main.py
```

打开 <http://127.0.0.1:5174>。本项目固定使用该端口；FastAPI 使用
<http://127.0.0.1:8767>。

`main.py` 会先等待 FastAPI 健康检查通过，再启动 Vite，避免前端代理在后端尚未
就绪时产生连接错误。按 `Ctrl+C` 会同时结束前后端。需要启动后自动打开浏览器时使用：

```powershell
python main.py --open
```

原有的 `npm run dev` 仍可使用，它现在也会转交给同一个 Python 启动器，
不再并发抢跑前后端。

生产构建与单端口启动：

```powershell
npm run build
npm start
```

生产服务地址为 <http://127.0.0.1:8767>。

## 配置实时 AI

编辑 `.env`：

```dotenv
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=你的服务端密钥
AI_MODEL=支持JSON输出的模型名
AI_TIMEOUT_MS=15000
```

AI 服务采用 OpenAI Chat Completions 兼容协议。密钥只由 FastAPI 后端读取，不会
进入浏览器构建产物。服务端会校验对象存在性、动作可执行性、角色知识和文本长度；
任何错误都会明确显示本地降级提示。

## 配置常驻语音解说

解说 Agent 会持续读取当前剧情、ABC 选项、实时票数、倒计时、SAN、昼夜和导演动作，
并监听 B 站弹幕。每轮投票只播一次完整导播稿，顺序为题目、ABC 选项、投票与改写玩法、
求关注；投票期间不再触发重复的空闲播报。真实票势变化、投票结果和观众发言仍会触发
短解说。“A 自定义内容”会触发创意锐评与后续猜测，新观众进房会被合并欢迎。

在本地 `.env` 增加：

```dotenv
# 可选 volcengine 或 dots
TTS_PROVIDER=volcengine

VOLC_TTS_API_KEY=你的火山引擎API Key
VOLC_TTS_CREATE_URL=https://openspeech.bytedance.com/api/v3/tts/create
VOLC_TTS_MODEL=seed-audio-1.0
COMMENTARY_IDLE_SECONDS=18
COMMENTARY_DANMAKU_SECONDS=1.5
COMMENTARY_WELCOME_SECONDS=8
COMMENTARY_PREWARM_CONCURRENCY=3
```

切换到 Dots TTS 时安装依赖并填写参考声音：

```powershell
pip install gradio_client
```

```dotenv
TTS_PROVIDER=dots
DOTS_TTS_BASE_URL=https://px-wj-2.matpool.com:29920
DOTS_TTS_PROMPT_AUDIO=D:\voices\commentator.wav
DOTS_TTS_PROMPT_TEXT=参考音频中实际说出的完整文字
DOTS_TTS_ODE_METHOD=euler
DOTS_TTS_NUM_STEPS=10
DOTS_TTS_GUIDANCE_SCALE=1.2
DOTS_TTS_SPEAKER_SCALE=1.5
DOTS_TTS_NORMALIZE_TEXT=false
DOTS_TTS_SEED=42
```

`DOTS_TTS_PROMPT_AUDIO` 支持本地绝对路径或公开 URL。修改提供方、参考声音、模型或语速
后会使用新的缓存空间，不会误用另一个提供方生成的音频。

文字解说与语音合成是两条独立流水线：长导播稿会按题目、单个选项、玩法和关注提示拆成
短句，所选 TTS 逐句生成音频，第一句就绪后立即播放，后续句子按原顺序排队。
固定的玩法说明、关注提示与动态题目、选项、弹幕锐评都会按“文本＋情绪”优先命中缓存，
没有命中时仅在实际需要播放该句时请求在线 TTS；后端启动时不会批量生成语音。
页面启动后会立即加载并尝试播放背景音乐，解说语音生成完成后也会直接进入播放队列，
不再要求先点击游戏画面。若使用普通浏览器，需要在浏览器站点设置中允许该地址自动播放声音；
OBS 浏览器源等允许自动播放的运行环境可直接使用。语音服务暂不可用时仍会显示解说字幕，
不阻塞投票与剧情。

正式直播前可主动生成完整的一分钟导播素材库：

```powershell
npm run audio:prewarm
```

该命令固定使用火山引擎生成语音包，按开场、玩法、自定义选项、中场、关注、拉票和
最后冲刺分阶段播放。经典剧情只提前朗读并缓存题目，不逐条朗读 A/B/C；只有弹幕、自定义提案和新观众
点名等无法预知的互动才会现场请求 TTS。

实时互动拥有更高的语音优先级：自定义选项锐评会打断普通预设播报，普通弹幕按高优先级
排队；封盘结果优先级最高，会清空尚未播放的旧语音并立即播放预生成结果。人物演出期间
则根据导演动作补充现场解说，避免投票之外的阶段长时间安静。

## 配置 B 站直播开放平台

编辑 `.env`：

```dotenv
BILIBILI_APP_ID=项目ID
BILIBILI_ACCESS_KEY=开发者AccessKey
BILIBILI_ACCESS_SECRET=开发者AccessSecret
BILIBILI_IDENTITY_CODE=主播身份码
```

FastAPI 启动时会自动使用身份码创建场次并连接直播间，不需要在游戏画面中保留
配置栏。接入实现包括：

- HMAC-SHA256 请求签名和请求体 MD5；
- `/v2/app/start`、`/v2/app/heartbeat`、`/v2/app/end`；
- WSS AUTH 包、20 秒 WebSocket 心跳和项目心跳；
- 多 WSS 集群地址失败切换；
- Version 2 zlib 与 Version 3 Brotli 递归解包；
- `LIVE_OPEN_PLATFORM_DM` 弹幕桥接；
- 以 `msg_id` 去重，以 `open_id` 标识观众；
- 每个剧情节点独立进行 60 秒投票；
- 弹幕 `A/B/C`、`1/2/3` 均可投票，同一观众以最后一票为准；
- 到时自动结算最高票，平票按 A、B、C 顺序处理；
- 完全无人投票时默认执行第一个选项 A；
- 程序退出时主动调用 END。

未上架应用通常只能连接开发者自己的直播间。直播画面约有 5～8 秒延迟，正式
开播时建议给提案和投票阶段预留足够时间。

官方文档：

- [平台介绍](https://open-live.bilibili.com/document/bdb1a8e5-a675-5bfe-41a9-7a7163f75dbf)
- [应用 API](https://open-live.bilibili.com/document/eba8e2e1-847d-e908-2e5c-7a1ec7d9266f)
- [长连接协议](https://open-live.bilibili.com/document/657d8e34-f926-a133-16c0-300c1afc6e6b)
- [弹幕事件](https://open-live.bilibili.com/document/f9ce25be-312e-1f4a-85fd-fef21f1637f8)
- [签名和错误码](https://open-live.bilibili.com/document/74eec767-e594-7ddd-6aba-257e8317c05d)

## 目录

```text
src/game/                 场景对象、NPC、世界状态与视觉状态
src/engine/               选项、校验、提案、投票、动作、对话、经典路线
src/components/           2.5D 像素场景、交互面板与直播控制台
backend/main.py           FastAPI 路由、SSE 与静态站点入口
backend/ai_service.py     服务端 AI 生成、校验与本地保底
backend/commentary_service.py  解说触发、弹幕聚合与语音任务调度
backend/tts_service.py     火山引擎/Dots TTS 调用与短音频缓存
backend/bilibili/         B 站签名、二进制协议和长连接客户端
public/assets/objects/    每个对象独立的 object.json
public/assets/generated/  AI 生成场景、透明角色帧与 UI 位图
scripts/process_generated_assets.py  去背、裁切、脚底对齐与透明通道校验
tests/                    前端规则与主验收测试
backend/tests/            FastAPI、AI 保底与 B 站协议测试
```

`HOVER` 和 `FOCUSED` 使用程序描边、标签和场景压暗合成；改变形态或内容的状态
由独立 SVG 几何分支绘制。这样可保证各状态的尺寸、视角、锚点和调色一致。后续
替换为 AI 生成的透明 PNG 时，沿用对象目录与状态名即可。

## 验证

```powershell
npm test
npm run test:backend
npm run build
```

自动化测试覆盖需求中的 20 项主验收，并额外覆盖 React 快照稳定性、投票去重、
提案安全过滤、B 站签名和压缩协议解析。

重新处理生成素材：

```powershell
python scripts/process_generated_assets.py
```

脚本会从 `public/assets/generated/source/` 读取洋红色键背景图，把人物量化为
64×96、24 色 RGBA PNG，把场景量化为 384×256、64 色 PNG，并校验透明四角、
可见像素范围和人物脚底基线。

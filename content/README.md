# JSON 剧情协作指南

剧情内容统一放在 `content/stories/`，运行时代码不再保存台词、站位或表情。

当前主剧情：

- `stories/melon-story.json`：角色、表情、站位、对话和分支。
- `schema/story.schema.json`：JSON Schema，负责编辑器自动补全和格式提示。

## 推荐协作流程

1. 每个人从主分支创建自己的 Git 分支。
2. 先在任务单里认领节点 ID，例如 `ask_price` 或 `reveal_magnet`。
3. 只修改自己认领的节点、表情或角色，避免多人同时调整同一段。
4. 提交前运行 `npm run story:validate`。
5. 再运行 `npm run check`，确认剧情、寻路、前后端测试和构建全部通过。

JSON 顶部已经设置：

```json
"$schema": "../schema/story.schema.json"
```

VS Code、WebStorm 和 PyCharm 可据此提供字段补全、类型提示和错误下划线。

## 剧情导演 Agent 计划

实时 Agent 不直接修改人物坐标或物品状态，而是输出
`director/director-plan.schema.json` 定义的导演计划。运行时会按 beat 顺序执行，
并在每条命令前检查人物、物品、表情、距离、路径和资源锁。

- `MOVE_TO`：只提交目的地，实际路径由游戏寻路器计算。
- `FACE`、`EMOTE`、`SPEAK`：控制朝向、登记表情和人物气泡。
- `INTERACT`：使用 `PICK_UP`、`PLACE`、`DROP`、`CUT` 原子事务。
- `WAIT`：仅暂停当前导演计划，持续世界、路人和昼夜不会暂停。

所有计划必须在 `requiredLocks` 中列出使用到的人物与物品。拿取、放置和切瓜不写
伸手过渡帧；人物先正常走到交互距离，物品与持物人物图再于同一帧完成切换。

## 定义角色与表情

角色位于 `characters`。角色 ID 可以自由增加，但必须唯一：

```json
"NEW_VENDOR": {
  "displayName": "新摊主",
  "initialPosition": { "column": 10, "row": 12 },
  "defaultExpression": "calm",
  "expressions": {
    "calm": {
      "pose": "idle",
      "animation": "breathe",
      "sprites": {
        "left": "/assets/characters/new_vendor_left.png",
        "right": "/assets/characters/new_vendor_right.png"
      }
    },
    "talk": {
      "pose": "talk",
      "animation": "talk",
      "sprites": {
        "left": "/assets/characters/new_vendor_left.png",
        "right": "/assets/characters/new_vendor_right.png"
      },
      "mouth": {
        "left": { "x": 42, "y": 21 },
        "right": { "x": 58, "y": 21 },
        "width": 4,
        "height": 2,
        "color": "#401a18",
        "openColor": "#14090a",
        "intervalMs": 160
      }
    },
    "angry": {
      "pose": "threaten",
      "animation": "shake",
      "sprites": "/assets/characters/new_vendor_angry.png"
    }
  }
}
```

`pose` 和 `animation` 都是可扩展标识。现有动画标识包括：

- `none`
- `breathe`
- `talk`
- `interact`
- `shake`
- `action`
- `walk`
- `fall8`

`sprites` 可以是一张固定状态图，也可以提供左右两个朝向。
`mouth` 字段目前仅作为素材标注保留，运行时不播放嘴型动画。人物是否正在说话完全由头顶聊天气泡表达。

人物素材统一以普通站立帧为基准：画布建议为 `64×96`，脚底落在 `y=94` 附近，非透明人物高度保持在 `89–92px`。宽度可以因胖瘦和持物自然变化，不要通过缩小整个人物来容纳宽动作；蹲下、倒地等姿态允许降低视觉高度。新增图集若透明边界与基准不同，需要在场景的图集视觉缩放表中校准，但脚底基线必须保持不变。

## 定义节点、站位和面向

每个普通节点必须提供 A、B、C 三个选项。演出自动节点和结局节点可以没有选项。

```json
{
  "id": "ask_price",
  "chapter": "二 · 问价",
  "speaker": "HAO_GE",
  "narration": "华强来到摊前，郝哥抬手比出价格。",
  "dialogue": "两块钱一斤。",
  "stageDirection": "双方在瓜摊右侧交谈。",
  "stage": {
    "bubble": {
      "visible": true,
      "maxWidth": 260,
      "offsetY": 18
    },
    "playerPlacement": {
      "at": { "column": 20, "row": 15 },
      "face": { "character": "HAO_GE" }
    },
    "characters": {
      "HUAQIANG": { "expression": "talk" },
      "HAO_GE": { "expression": "talk" },
      "NEIGHBOR": {
        "expression": "watch",
        "position": { "column": 24, "row": 14 }
      }
    }
  },
  "choices": [
    {
      "id": "A",
      "label": "继续追问",
      "description": "进入经典路线。",
      "next": "pick_melon",
      "canonical": true,
      "tensionDelta": 5
    },
    {
      "id": "B",
      "label": "换个话题",
      "description": "进入另一分支。",
      "next": "other_branch",
      "canonical": false,
      "tensionDelta": 0
    },
    {
      "id": "C",
      "label": "暂时离开",
      "description": "结束本次交谈。",
      "next": "peaceful_exit",
      "canonical": false,
      "tensionDelta": -5
    }
  ]
}
```

`narration` 和 `dialogue` 必须严格区分：

- `narration` 是第三人称场景描述，只显示在底部旁白框。
- `dialogue` 是人物真正说出口的直接引语，不写人物名和引号，只显示在 `speaker` 头顶气泡。
- 没有人说话的节点不要填写 `dialogue`，此时不会出现气泡，也不会播放嘴部动画。

`stage.bubble` 可省略，默认跟随当前 `speaker`。需要隐藏人物台词时可设置 `"visible": false`；`offsetY` 用来调整气泡与人物头顶的距离。

面向固定位置时使用：

```json
"face": {
  "position": { "column": 18, "row": 14 }
}
```

## 定义逐拍动作分镜

有拿取、行走、拍打、称重或切瓜等行为时，使用 `stage.sequence.beats`。每一拍只写发生变化的状态，前一拍的持物、道具和角色状态会自动延续：

```json
"sequence": {
  "beats": [
    {
      "id": "walk_to_pile",
      "label": "摊主走向瓜堆",
      "durationMs": 700,
      "bubble": false,
      "characters": {
        "HAO_GE": {
          "position": { "column": 18, "row": 15 },
          "facing": "left",
          "motion": "walk"
        }
      }
    },
    {
      "id": "lift_melon",
      "label": "拿起一只西瓜",
      "durationMs": 480,
      "characters": {
        "HAO_GE": {
          "motion": "lift",
          "spriteSheet": {
            "asset": "/assets/generated/sprites/hao_pick_melon_sheet.png",
            "columns": 4,
            "rows": 1,
            "frame": 1
          }
        }
      },
      "props": {
        "melon_pile": { "state": "one-missing" }
      }
    },
    {
      "id": "say_line",
      "label": "摊主开口询问",
      "durationMs": 160,
      "bubble": true,
      "characters": {
        "HAO_GE": { "expression": "talk", "motion": "hold" }
      }
    }
  ]
}
```

可用 `motion`：`idle`、`walk`、`reach`、`lift`、`hold`、`pat`、`present`。`props` 可以改变道具状态，也可以通过 `position` 将独立道具放到秤盘、桌面等位置。持物搬运时应先把独立道具设为 `hidden`，由角色持物帧负责表现；角色松手的同一拍再把道具改为可见状态并设置最终位置，避免道具自己滑过场景。需要从持物图集恢复普通精灵时填写 `"spriteSheet": null`。分镜播放期间选项会锁定；应在动作结束的最后一拍才设置 `"bubble": true`。

## 校验内容

`npm run story:validate` 会检查：

- JSON 字段和类型；
- 重复节点 ID；
- 不存在的角色、表情和跳转；
- 旁白、人物台词和说话人引用；
- 分镜节拍 ID、时长、角色、表情、精灵帧和道具位置；
- 普通节点是否恰好有 A/B/C 三个选项；
- 入口节点和经典路线是否完整；
- 角色及演出站位是否越界；
- 站位是否被瓜摊、家具或 NPC 占用；
- 从主角初始位置到每个演出站位是否存在不穿模路径。

如果校验失败，命令会返回非零状态，适合直接放入 CI。

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any


PresetLine = tuple[str, str]


def _clean(value: Any, maximum: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:maximum]


ROUND_RULES_VOTE = (
    "想让华强走哪条路，弹幕直接发A、B或者C；你最后发的那票算数。"
)
ROUND_RULES_CUSTOM = (
    "ABC都不合心意？发“A 空格你的主意”，这轮选项就按你的脑洞改。"
)
ROUND_FOLLOW_CALL = (
    "要是你就爱看剧情被弹幕带跑偏，关注先点上，下一轮还让你做主。"
)

ROUND_CUE_SCHEDULE: tuple[tuple[int, str], ...] = (
    (56, "opening"),
    (49, "rules"),
    (41, "custom"),
    (33, "midfield"),
    (25, "follow"),
    (17, "rally"),
    (9, "closing"),
    (4, "last_call"),
)

RULE_LINES: tuple[PresetLine, ...] = tuple(
    (text, "ENERGETIC")
    for text in (
        ROUND_RULES_VOTE,
        "想让华强怎么走，弹幕直接发A、B或者C。",
        "选好以后把字母打出来，光在心里支持可不算票。",
        "投票很简单，看中哪一项，就发它前面的字母。",
        "不用复制整句话，一个A、B或者C就能参与。",
        "每个人都能投票，临时改主意也行，最后一票生效。",
        "不用打长句，看中哪条路就发对应字母；临时反悔也行，最后一票生效。",
        "屏幕下面已经开投，选哪个就把哪个字母送上来。",
        "别急着跟别人站队，先看清楚，再把你的选择发出来。",
        "这一分钟华强不自己做主，弹幕里的字母才算决定。",
    )
)

CUSTOM_LINES: tuple[PresetLine, ...] = tuple(
    (text, "PLAYFUL")
    for text in (
        ROUND_RULES_CUSTOM,
        "ABC都不满意？发‘字母、空格、你的办法’，可以现场改题。",
        "觉得现成选项不够好，字母后面空一格，写出你的主意。",
        "脑洞大的别憋着，像‘A 空格你的方案’这样发，能直接改选项。",
        "选项不合胃口也没关系，你可以在字母后面写一条新的走法。",
        "这里不只允许投票，还允许改题，就看谁的主意更有节目效果。",
        "如果你有第四种办法，不用等D，直接挑一个字母把它改掉。",
        "想给剧情加点难度？字母后面跟上你的描述，我看看有多离谱。",
        "现成答案只是参考，真正敢想的观众可以自己写一个。",
        "嫌现成选项不够狠？字母后面空一格，再写你的办法，现场就能改题。",
    )
)

NO_VOTE_MID_LINES: tuple[PresetLine, ...] = tuple(
    (text, "PLAYFUL")
    for text in (
        "现在还没人落第一票，看来大家都想让别人先背这个锅。",
        "弹幕还在观察，但华强可没法一直站这儿等，谁先来一票？",
        "这会儿安静得有点危险，第一票往往最容易把后面的人带跑。",
        "别都当场外指导，来个人亲自下场，把第一个字母发出来。",
        "票数还是零。是三个选项太难选，还是大家都在等别人试水？",
    )
)

NO_VOTE_LATE_LINES: tuple[PresetLine, ...] = tuple(
    (text, "URGENT")
    for text in (
        "目前票箱还是空的。再没人表态，这轮就按A执行。",
        "大家都看明白了吗？没人投的话，默认选项可就直接接管剧情了。",
        "再观望下去，默认选项就要不战而胜了。",
    )
)

ACTIVE_VOTE_LINES: tuple[PresetLine, ...] = tuple(
    (text, "SUSPENSE")
    for text in (
        "已经有人出手了，不过现在这个局面还远远没有定下来。",
        "票开始往里进了，后来的观众照自己的判断选，不用跟票。",
        "现在每一票都很有分量，少一个字母，结果可能就换个方向。",
        "场上已经有声音了，但谁能笑到封盘，还真不好说。",
        "有人已经选边站，剩下的观众准备把局面推向哪边？",
        "投票正在往前走，现在改票还来得及。",
        "前面的票只是开头，真正决定结果的可能是后面这一波。",
        "局势还没锁死，想保哪条路，现在都还有操作空间。",
        "还没投的可以出手了，领先的别放心太早，后面一波弹幕就能翻。",
        "现在每一票都顶用，你这一个字母，可能就是华强手里的方向盘。",
    )
)

TIE_LINES: tuple[PresetLine, ...] = tuple(
    (text, "SUSPENSE")
    for text in (
        "现在票数咬住了，谁再补一票，谁就能先把方向抢过去。",
        "几边谁也没说服谁，这一票可能直接打破平衡。",
        "场面僵住了。后进来的观众，可能正好握着决定票。",
        "票数贴得很紧，这时候跟风不如说说你为什么这么选。",
        "目前谁都没占到便宜，华强下一步还悬在半空。",
        "这局已经顶到一起了，再来一个字母，风向马上就变。",
    )
)

MIDFIELD_LINES: tuple[PresetLine, ...] = tuple(
    (text, "PLAYFUL")
    for text in (
        "时间走了一半，没投的还能慢慢看，已经投的也可以改主意。",
        "这一轮已经过半，大家是相信稳妥路线，还是想看事情失控？",
        "先别急着封神任何一个选项，剧情真正执行以后才知道有没有坑。",
        "还有时间，后进来的观众先看题目，再决定要不要改变现在的局面。",
        "走到中场，最有意思的往往不是谁领先，而是谁突然换边。",
        "现在投票还开着，有不同看法就直接用字母说话。",
        "题目大家都看过了，接下来就看哪一种判断更能说服弹幕。",
        "中场到了，这时候最怕所有人都觉得别人会替自己投。",
        "票还在动，现在改主意完全来得及，别等封盘了才拍大腿。",
        "表面上瓜摊挺安静，实际上每条弹幕都在给后面的剧情挖坑。",
    )
)

FOLLOW_LINES: tuple[PresetLine, ...] = tuple(
    (text, "PLAYFUL")
    for text in (
        ROUND_FOLLOW_CALL,
        "喜欢这种弹幕亲手改剧情的玩法，可以点个关注，下一轮继续来做主。",
        "第一次来的朋友先看这一轮，觉得有意思再留下，后面还有更多选择。",
        "关注可以先点上，下一条世界线还得请你回来负责。",
        "要是你喜欢看剧情被观众带偏，留个关注，后面还有更难的题。",
        "这里每一轮都由弹幕决定。想继续当导演，就别把直播间弄丢了。",
        "觉得这个玩法对胃口，可以顺手关注，下次开播直接回来接管华强。",
        "今天投过的观众别急着走，点个关注，下一轮还能回来检查后果。",
        "如果你想知道自己这一票最后闯了多大祸，关注一下，接着往后看。",
        "刚进来的朋友先看一轮，觉得这事儿够离谱，就点个关注接着当导演。",
    )
)

CLOSING_LINES: tuple[PresetLine, ...] = tuple(
    (text, "URGENT")
    for text in (
        "最后十秒，想守住结果的抓紧，想翻盘的更不能等。",
        "马上封盘。别只在心里选，字母发出来才算参与。",
        "倒计时进最后一段，现在这一票可能就是决定票。",
        "最后机会来了，等结果弹出来再后悔可就晚了。",
        "封盘之前还能改票，手里有不同意见的现在说。",
        "时间不多了，领先的一方别松，落后的一方也还没出局。",
        "最后几秒，华强下一步往哪走，就看这一波弹幕。",
        "准备收票。还没表态的观众，现在把字母敲出来。",
        "最后十秒，想守结果的赶紧守，想翻盘的现在就是最后窗口。",
        "马上封盘，别光在心里选，字母得发出来才算你做过主。",
    )
)

LAST_CALL_LINES: tuple[PresetLine, ...] = tuple(
    (text, "URGENT")
    for text in (
        "四、三、二——最后一票！",
        "马上封盘，还没投的现在出手！",
        "最后几秒，字母走一个！",
        "要改票就是现在，准备收！",
        "别犹豫了，结果马上锁定！",
        "五、四、三——还没投的，弹幕里把那个字母敲出来！",
        "这就封盘了！现在不表态，等会儿可别说华强没听你的。",
    )
)

ROUND_CUE_POOLS: dict[str, tuple[PresetLine, ...]] = {
    "opening": (
        (
            "来了，这一轮华强不自己拿主意，屏幕前的各位接管剧情。",
            "PLAYFUL",
        ),
        (
            "先别急着划走，这一票真能改剧情，华强下一步听弹幕的。",
            "ENERGETIC",
        ),
    ),
    "rules": RULE_LINES,
    "custom": CUSTOM_LINES,
    "midfield": MIDFIELD_LINES,
    "follow": FOLLOW_LINES,
    "rally": ACTIVE_VOTE_LINES,
    "closing": CLOSING_LINES,
    "last_call": LAST_CALL_LINES,
}

VOTE_RESULT_LINES: dict[str, PresetLine] = {
    choice: (
        f"好，封盘！这轮是{choice}拿下，华强就照弹幕选的这条路走。",
        "ENERGETIC",
    )
    for choice in ("A", "B", "C")
}

VOTE_SHIFT_TEMPLATES: tuple[str, ...] = (
    "哎，风向变了！现在是{choice}冲到了前面。",
    "刚刚完成反超，{choice}暂时接过了方向盘。",
    "票势重新洗牌，现在领先的是{choice}。",
    "后排发力了，{choice}刚刚把位置抢了回来。",
    "注意这次变化，{choice}现在已经走到最前面。",
    "这轮还真不稳，刚才的领先者已经换成{choice}了。",
    "弹幕把局面扳了一下，现在轮到{choice}占上风。",
    "{choice}刚刚反超，不过离封盘还有时间，先别急着庆祝。",
)

VOTE_SHIFT_LINES: dict[str, tuple[PresetLine, ...]] = {
    choice: tuple(
        (template.format(choice=choice), "SUSPENSE")
        for template in VOTE_SHIFT_TEMPLATES
    )
    for choice in ("A", "B", "C")
}

IDLE_LINES: tuple[PresetLine, ...] = (
    (
        "人物还在把这一段演完，咱们先看着，下一道选择接上就开投。",
        "CALM",
    ),
    (
        "这一段先让场上的人把事办完，弹幕歇口气，马上还得接着选。",
        "PLAYFUL",
    ),
    (
        "场上还在走剧情，我先不抢话；等下一题出来，咱们再一起拿主意。",
        "CALM",
    ),
    (
        "先盯住华强这边，事情还没落稳，新的选择很快就会接上。",
        "SUSPENSE",
    ),
)


def build_round_script_segments(
    state: dict[str, Any],
) -> tuple[str, ...]:
    narration = _clean(state.get("narration"), 38).rstrip(
        "，。！？；："
    )
    if not narration:
        return ()
    return (f"这一轮要决定的是：{narration}。",)


def _choose_line(
    pool: tuple[PresetLine, ...], seed: str, offset: int = 0
) -> PresetLine:
    digest = hashlib.sha256(
        seed.encode("utf-8")
    ).digest()
    index = (int.from_bytes(digest[:4], "big") + offset) % len(pool)
    return pool[index]


def _vote_snapshot(state: dict[str, Any]) -> tuple[int, bool]:
    votes = state.get("votes") or {}
    counts = [
        max(0, int(value))
        for value in votes.values()
        if isinstance(value, (int, float))
    ]
    total = sum(counts)
    if total == 0 or not counts:
        return total, False
    top = max(counts)
    return total, sum(count == top for count in counts) > 1


def choose_round_cue(
    cue_id: str,
    round_key: str,
    state: dict[str, Any],
) -> PresetLine:
    total_votes, tied = _vote_snapshot(state)
    seed = f"{round_key}:{cue_id}"
    if total_votes == 0 and cue_id in {"midfield", "rally"}:
        offset = 1 if cue_id == "rally" else 0
        return _choose_line(NO_VOTE_MID_LINES, round_key, offset)
    if total_votes == 0 and cue_id == "closing":
        return _choose_line(NO_VOTE_LATE_LINES, seed)
    if tied and cue_id in {"midfield", "rally"}:
        offset = 1 if cue_id == "rally" else 0
        return _choose_line(TIE_LINES, round_key, offset)
    pool = ROUND_CUE_POOLS[cue_id]
    return _choose_line(pool, seed)


def choose_vote_shift_line(
    choice: str, state: dict[str, Any]
) -> PresetLine:
    pool = VOTE_SHIFT_LINES.get(choice, VOTE_SHIFT_LINES["A"])
    votes = state.get("votes") or {}
    total = sum(
        max(0, int(value))
        for value in votes.values()
        if isinstance(value, (int, float))
    )
    seed = (
        f"{state.get('nodeId', '')}:"
        f"{state.get('routeLength', 0)}:{choice}:{total}"
    )
    return _choose_line(pool, seed)


def choose_idle_line(route_length: int) -> PresetLine:
    return IDLE_LINES[route_length % len(IDLE_LINES)]


def _canonical_round_lines() -> tuple[PresetLine, ...]:
    story_path = (
        Path(__file__).resolve().parents[1]
        / "content"
        / "stories"
        / "melon-story.json"
    )
    try:
        story = json.loads(story_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return ()
    nodes = {
        str(node.get("id")): node
        for node in story.get("nodes", [])
        if isinstance(node, dict)
    }
    lines: list[PresetLine] = []
    for node_id in story.get("canonRoute", []):
        node = nodes.get(str(node_id))
        if not node or not node.get("choices"):
            continue
        state = {
            "narration": node.get("narration"),
            "choices": node.get("choices"),
        }
        lines.extend(
            (segment, "ENERGETIC")
            for segment in build_round_script_segments(state)
        )
    return tuple(lines)


def _unique_lines(lines: list[PresetLine]) -> tuple[PresetLine, ...]:
    seen: set[PresetLine] = set()
    result: list[PresetLine] = []
    for line in lines:
        if line in seen:
            continue
        seen.add(line)
        result.append(line)
    return tuple(result)


PRESET_COMMENTARY_LINES = _unique_lines(
    [
        *(
            line
            for pool in ROUND_CUE_POOLS.values()
            for line in pool
        ),
        *NO_VOTE_MID_LINES,
        *NO_VOTE_LATE_LINES,
        *TIE_LINES,
        *VOTE_RESULT_LINES.values(),
        *(
            line
            for pool in VOTE_SHIFT_LINES.values()
            for line in pool
        ),
        *IDLE_LINES,
        *_canonical_round_lines(),
    ]
)

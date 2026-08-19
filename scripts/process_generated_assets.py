from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "assets" / "generated" / "source"
SPRITES = ROOT / "public" / "assets" / "generated" / "sprites"
UI = ROOT / "public" / "assets" / "generated" / "ui"
PROPS = ROOT / "public" / "assets" / "generated" / "props"
SPRITE_CANVAS = (64, 96)
SPRITE_FOOT_MARGIN = 2


def remove_magenta(image: Image.Image) -> Image.Image:
    """将 AI 素材的洋红色键背景变为透明通道。"""
    rgba = image.convert("RGBA")
    pixels: list[tuple[int, int, int, int]] = []
    for red, green, blue, _alpha in rgba.getdata():
        keyed = red > 180 and blue > 180 and green < 145
        if keyed:
            pixels.append((0, 0, 0, 0))
        else:
            pixels.append((red, green, blue, 255))
    rgba.putdata(pixels)
    return rgba


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("色键处理后没有留下任何可见像素")
    return bbox


def fit_to_footline(
    image: Image.Image,
    *,
    canvas: tuple[int, int] = SPRITE_CANVAS,
    margin: int = SPRITE_FOOT_MARGIN,
) -> Image.Image:
    """裁切主体并按脚底基线放入统一透明画布。"""
    cropped = image.crop(alpha_bbox(image))
    max_width = canvas[0] - margin * 2
    max_height = canvas[1] - margin * 2
    scale = min(
        max_width / cropped.width,
        max_height / cropped.height,
        1.0,
    )
    if scale != 1.0:
        cropped = cropped.resize(
            (
                max(1, round(cropped.width * scale)),
                max(1, round(cropped.height * scale)),
            ),
            Image.Resampling.NEAREST,
        )
    output = Image.new("RGBA", canvas, (0, 0, 0, 0))
    x = (canvas[0] - cropped.width) // 2
    y = canvas[1] - margin - cropped.height
    output.alpha_composite(cropped, (x, y))
    return output


def quantize_rgba(
    image: Image.Image,
    colors: int = 24,
) -> Image.Image:
    """保留透明通道，把可见像素限制到 8-bit 风格色板。"""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    quantized = (
        rgba.convert("RGB")
        .quantize(
            colors=colors,
            method=Image.Quantize.MEDIANCUT,
            dither=Image.Dither.NONE,
        )
        .convert("RGBA")
    )
    quantized.putalpha(alpha)
    return quantized


def validate_alpha(
    path: Path,
    expected_size: tuple[int, int] | None,
    *,
    foot_margin: int | None = None,
) -> None:
    with Image.open(path) as image:
        if image.mode != "RGBA":
            raise ValueError(f"{path.name} 不含 RGBA 透明通道")
        if expected_size and image.size != expected_size:
            raise ValueError(
                f"{path.name} 尺寸为 {image.size}，预期 {expected_size}"
            )
        alpha = image.getchannel("A")
        extrema = alpha.getextrema()
        if extrema[0] != 0 or extrema[1] != 255:
            raise ValueError(f"{path.name} 透明通道范围异常：{extrema}")
        corners = [
            alpha.getpixel((0, 0)),
            alpha.getpixel((image.width - 1, 0)),
            alpha.getpixel((0, image.height - 1)),
            alpha.getpixel((image.width - 1, image.height - 1)),
        ]
        if any(corners):
            raise ValueError(f"{path.name} 四角未完全透明")
        bbox = alpha_bbox(image)
        if (
            foot_margin is not None
            and bbox[3] > image.height - foot_margin
        ):
            raise ValueError(f"{path.name} 脚底没有保留统一边距")


def split_grid(
    source_name: str,
    columns: int,
    rows: int,
    output_names: list[str | None],
    *,
    canvas: tuple[int, int] = SPRITE_CANVAS,
    canvas_by_index: dict[int, tuple[int, int]] | None = None,
) -> list[str]:
    source = remove_magenta(Image.open(SOURCE / source_name))
    cell_width = source.width // columns
    cell_height = source.height // rows
    if len(output_names) != columns * rows:
        raise ValueError("输出名称数量与网格帧数不一致")
    paths: list[str] = []
    for index, name in enumerate(output_names):
        if name is None:
            continue
        column = index % columns
        row = index // columns
        cell = source.crop(
            (
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            )
        )
        target_canvas = (canvas_by_index or {}).get(index, canvas)
        output = quantize_rgba(fit_to_footline(cell, canvas=target_canvas))
        path = SPRITES / f"{name}.png"
        output.save(path, optimize=True)
        validate_alpha(
            path,
            target_canvas,
            foot_margin=SPRITE_FOOT_MARGIN,
        )
        paths.append(f"/assets/generated/sprites/{name}.png")
    return paths


def crop_ui_asset(
    source: Image.Image,
    name: str,
    region: tuple[int, int, int, int],
) -> str:
    asset = source.crop(region)
    asset = asset.crop(alpha_bbox(asset))
    asset = asset.resize(
        (
            max(1, round(asset.width / 4)),
            max(1, round(asset.height / 4)),
        ),
        Image.Resampling.NEAREST,
    )
    asset = quantize_rgba(asset, colors=32)
    path = UI / f"{name}.png"
    asset.save(path, optimize=True)
    validate_alpha(path, None)
    return f"/assets/generated/ui/{name}.png"


def split_prop_grid() -> dict[str, str]:
    """将 4×3 道具表拆成与瓦片占地匹配的透明 PNG。"""
    source = remove_magenta(Image.open(SOURCE / "market-props-keyed.png"))
    cell_width = source.width // 4
    cell_height = source.height // 3
    specs = [
        ("market_stall", (256, 192)),
        ("melon_rack", (128, 128)),
        ("melon_pallet", (128, 96)),
        ("melon_pile", (96, 96)),
        ("hao_scale_prop", (96, 128)),
        ("cutting_table", (160, 96)),
        ("empty_crate", (96, 96)),
        ("melon_basket", (96, 96)),
        (None, (160, 96)),
        ("short_stool_prop", (64, 96)),
        ("price_board", (64, 96)),
        ("single_melon", (64, 64)),
    ]
    assets: dict[str, str] = {}
    PROPS.mkdir(parents=True, exist_ok=True)
    for index, (name, canvas) in enumerate(specs):
        if name is None:
            continue
        column = index % 4
        row = index // 4
        cell = source.crop(
            (
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            )
        )
        output = quantize_rgba(fit_to_footline(cell, canvas=canvas), colors=24)
        path = PROPS / f"{name}.png"
        output.save(path, optimize=True)
        validate_alpha(path, canvas, foot_margin=SPRITE_FOOT_MARGIN)
        assets[name] = f"/assets/generated/props/{name}.png"
    motorcycle = remove_magenta(
        Image.open(SOURCE / "black-motorcycle-keyed.png")
    )
    motorcycle = quantize_rgba(
        fit_to_footline(motorcycle, canvas=(160, 112)),
        colors=24,
    )
    motorcycle_path = PROPS / "black_motorcycle.png"
    motorcycle.save(motorcycle_path, optimize=True)
    validate_alpha(
        motorcycle_path,
        (160, 112),
        foot_margin=SPRITE_FOOT_MARGIN,
    )
    assets["black_motorcycle"] = (
        "/assets/generated/props/black_motorcycle.png"
    )
    return assets


def process_tile_map() -> str:
    """裁成 4:3，并生成与 32×24 瓦片地图一致的 512×384 底图。"""
    source = Image.open(SOURCE / "market-map-base.png").convert("RGB")
    target_ratio = 4 / 3
    if source.width / source.height > target_ratio:
        width = round(source.height * target_ratio)
        left = (source.width - width) // 2
        source = source.crop((left, 0, left + width, source.height))
    else:
        height = round(source.width / target_ratio)
        top = (source.height - height) // 2
        source = source.crop((0, top, source.width, top + height))
    output = source.resize((512, 384), Image.Resampling.NEAREST).quantize(
        colors=64,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )
    path = ROOT / "public" / "assets" / "generated" / "market-map-8bit.png"
    output.save(path, optimize=True)
    return "/assets/generated/market-map-8bit.png"


def main() -> None:
    SPRITES.mkdir(parents=True, exist_ok=True)
    UI.mkdir(parents=True, exist_ok=True)
    PROPS.mkdir(parents=True, exist_ok=True)

    player = split_grid(
        "player-walk-16-keyed.png",
        8,
        2,
        [
            "player_walk_right_0",
            "player_walk_right_1",
            "player_walk_right_2",
            "player_walk_right_3",
            "player_walk_right_4",
            "player_walk_right_5",
            "player_walk_right_6",
            "player_walk_right_7",
            "player_walk_left_0",
            "player_walk_left_1",
            "player_walk_left_2",
            "player_walk_left_3",
            "player_walk_left_4",
            "player_walk_left_5",
            "player_walk_left_6",
            "player_walk_left_7",
        ],
    )
    idle = split_grid(
        "player-idle-4-keyed.png",
        4,
        1,
        [
            "player_idle_0",
            "player_idle_1",
            "player_idle_2",
            "player_idle_3",
        ],
    )
    npcs = split_grid(
        "npc-sheet-8bit-keyed.png",
        4,
        1,
        [
            "vendor_right",
            "vendor_left",
            None,
            None,
        ],
    )
    story_npcs = split_grid(
        "hao-story-sheet-keyed.png",
        4,
        3,
        [
            "hao_fall_0",
            "hao_fall_1",
            "hao_fall_2",
            "hao_fall_3",
            "hao_fall_4",
            "hao_fall_5",
            "hao_fall_6",
            "hao_fall_7",
            "hao_injured",
            "hao_angry",
            "neighbor_left",
            "neighbor_right",
        ],
        canvas=(96, 64),
        canvas_by_index={
            9: SPRITE_CANVAS,
            10: SPRITE_CANVAS,
            11: SPRITE_CANVAS,
        },
    )
    props = split_prop_grid()

    ui_source = remove_magenta(Image.open(SOURCE / "ui-atlas-keyed.png"))
    width, height = ui_source.size
    ui = {
        "header": crop_ui_asset(
            ui_source, "header-plaque", (0, 0, width, round(height * .34))
        ),
        "panel": crop_ui_asset(
            ui_source,
            "dialogue-panel",
            (0, round(height * .34), width, round(height * .73)),
        ),
        "redButton": crop_ui_asset(
            ui_source,
            "button-red",
            (0, round(height * .72), width // 2, height),
        ),
        "greenButton": crop_ui_asset(
            ui_source,
            "button-green",
            (width // 2, round(height * .72), width, height),
        ),
    }

    scene_path = process_tile_map()

    manifest = {
        "player": {
            "right": player[:8],
            "left": player[8:],
            "idle": idle,
        },
        "npcs": {
            "vendor": {"right": npcs[0], "left": npcs[1]},
            "haoFall": story_npcs[:8],
            "haoInjured": story_npcs[8],
            "haoAngry": story_npcs[9],
            "neighbor": {
                "left": story_npcs[10],
                "right": story_npcs[11],
            },
        },
        "ui": ui,
        "props": props,
        "scene": scene_path,
        "canvas": {
            "width": SPRITE_CANVAS[0],
            "height": SPRITE_CANVAS[1],
            "footMargin": SPRITE_FOOT_MARGIN,
        },
    }
    manifest_path = (
        ROOT / "public" / "assets" / "generated" / "manifest.json"
    )
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        f"已处理 {len(player)} 帧行走、{len(idle)} 帧待机、"
        f"{len(npcs) + len(story_npcs)} 个 NPC 状态、"
        f"{len(ui)} 个 UI 素材、{len(props)} 个独立道具和 1 张瓦片场景。"
    )


if __name__ == "__main__":
    main()

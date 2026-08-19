from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = (
    PROJECT_ROOT
    / "public"
    / "assets"
    / "generated"
    / "sprites"
    / "hallucinations"
)
SOURCE_ROOT = ASSET_ROOT / "source"
CHARACTERS = ("guga", "knife_shield", "bibila", "nailong")
FRAME_SIZE = (64, 96)
CONTENT_SIZE = (58, 88)
FOOTLINE_Y = 93


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value >= 24 else 0).getbbox()
    if bbox is None:
        raise ValueError("帧内没有检测到角色像素")
    return bbox


def harden_alpha(image: Image.Image) -> Image.Image:
    result = image.copy()
    alpha = result.getchannel("A").point(
        lambda value: 0 if value < 72 else 255,
    )
    result.putalpha(alpha)
    return result


def process_sheet(character: str) -> list[Path]:
    source_path = SOURCE_ROOT / f"{character}_sheet_alpha.png"
    sheet = Image.open(source_path).convert("RGBA")
    cell_width = sheet.width // 4
    cell_height = sheet.height // 2
    cells: list[Image.Image] = []
    bboxes: list[tuple[int, int, int, int]] = []

    for row in range(2):
        for column in range(4):
            left = column * cell_width
            top = row * cell_height
            right = sheet.width if column == 3 else (column + 1) * cell_width
            bottom = sheet.height if row == 1 else (row + 1) * cell_height
            cell = sheet.crop((left, top, right, bottom))
            cells.append(cell)
            bboxes.append(alpha_bbox(cell))

    max_width = max(right - left for left, _, right, _ in bboxes)
    max_height = max(bottom - top for _, top, _, bottom in bboxes)
    scale = min(
        CONTENT_SIZE[0] / max_width,
        CONTENT_SIZE[1] / max_height,
    )
    written: list[Path] = []

    for index, (cell, bbox) in enumerate(zip(cells, bboxes, strict=True)):
        direction = "right" if index < 4 else "left"
        frame_index = index % 4
        cropped = cell.crop(bbox)
        resized = cropped.resize(
            (
                max(1, round(cropped.width * scale)),
                max(1, round(cropped.height * scale)),
            ),
            Image.Resampling.NEAREST,
        )
        resized = harden_alpha(resized)
        canvas = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
        x = (FRAME_SIZE[0] - resized.width) // 2
        y = FOOTLINE_Y - resized.height + 1
        canvas.alpha_composite(resized, (x, y))
        output = ASSET_ROOT / f"{character}_{direction}_{frame_index}.png"
        canvas.save(output, optimize=True)
        written.append(output)

    return written


def create_preview(frames: dict[str, list[Path]]) -> Path:
    scale = 3
    label_height = 24
    padding = 10
    row_height = FRAME_SIZE[1] * scale + label_height + padding
    preview = Image.new(
        "RGBA",
        (
            padding * 2 + FRAME_SIZE[0] * scale * 8,
            padding + row_height * len(frames),
        ),
        (40, 45, 55, 255),
    )
    draw = ImageDraw.Draw(preview)

    for row, (character, paths) in enumerate(frames.items()):
        row_top = padding + row * row_height
        draw.text((padding, row_top), character, fill=(255, 255, 255, 255))
        sprite_top = row_top + label_height
        for column, path in enumerate(paths):
            sprite = Image.open(path).convert("RGBA").resize(
                (FRAME_SIZE[0] * scale, FRAME_SIZE[1] * scale),
                Image.Resampling.NEAREST,
            )
            left = padding + column * FRAME_SIZE[0] * scale
            cell = Image.new("RGBA", sprite.size, (0, 0, 0, 0))
            checker = ImageDraw.Draw(cell)
            block = 12
            for y in range(0, cell.height, block):
                for x in range(0, cell.width, block):
                    color = (
                        (74, 82, 96, 255)
                        if (x // block + y // block) % 2 == 0
                        else (54, 61, 73, 255)
                    )
                    checker.rectangle((x, y, x + block - 1, y + block - 1), fill=color)
            cell.alpha_composite(sprite)
            preview.alpha_composite(cell, (left, sprite_top))

    output = SOURCE_ROOT / "hallucination_frames_preview.png"
    preview.save(output, optimize=True)
    return output


def validate(paths: list[Path]) -> None:
    for path in paths:
        image = Image.open(path)
        if image.mode != "RGBA":
            raise ValueError(f"{path.name} 不是 RGBA")
        if image.size != FRAME_SIZE:
            raise ValueError(f"{path.name} 尺寸错误：{image.size}")
        if image.getchannel("A").getbbox() is None:
            raise ValueError(f"{path.name} 没有可见像素")
        if image.getpixel((0, 0))[3] != 0:
            raise ValueError(f"{path.name} 左上角不是透明像素")


def main() -> None:
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    processed = {
        character: process_sheet(character)
        for character in CHARACTERS
    }
    all_frames = [
        path
        for paths in processed.values()
        for path in paths
    ]
    validate(all_frames)
    preview = create_preview(processed)
    print(f"已生成并校验 {len(all_frames)} 帧：{ASSET_ROOT}")
    print(f"预览图：{preview}")


if __name__ == "__main__":
    main()

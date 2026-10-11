#!/usr/bin/env python3
"""
Draws the HL7 Decoder app icon and writes every size the macOS app's icon set needs.

    python3 tools/make_icon.py [path/to/InterDisplay-ExtraBold.otf]

Needs Pillow (`python3 -m pip install pillow`). The font defaults to Inter Display ExtraBold
(https://rsms.me/inter, SIL Open Font Licence) at its usual Linux install path; pass another
path to use a different copy. The letters are drawn into the PNGs, so the app does not ship the font.

Design: Apple's macOS icon grid (an 824 px rounded square centred on a 1024 px canvas, with a
soft drop shadow), the app's teal accent as a gradient, "HL7" in white, and underneath it a
strip in the four delimiter colours the app uses to colour a raw message (| ^ ~ &).
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
ICONSET = os.path.join(ROOT, 'macos-app/macos/HL7DecoderMac-macOS/Assets.xcassets/AppIcon.appiconset')
FONT = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf'

S = 4  # draw at 4x and scale down, for smooth edges
SIZE = 1024 * S

TEAL_TOP = (20, 184, 166)     # #14B8A6
TEAL_BOTTOM = (15, 118, 110)  # #0F766E, colors.accent in src/ui/theme.ts
# colors.fieldSep, compSep, repSep, subSep in src/ui/theme.ts
DELIMITERS = [(37, 99, 235), (234, 88, 12), (147, 51, 234), (22, 163, 74)]


def px(v: float) -> int:
    return round(v * S)


def draw_master() -> Image.Image:
    left, top, side, radius = 100, 100, 824, 185
    body = (px(left), px(top), px(left + side), px(top + side))

    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))

    # Drop shadow under the rounded square.
    shadow = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((body[0], body[1] + px(12), body[2], body[3] + px(12)), px(radius), fill=90)
    canvas.paste((0, 0, 0, 255), (0, 0), shadow.filter(ImageFilter.GaussianBlur(px(14))))

    # Vertical teal gradient clipped to the rounded square.
    gradient = Image.new('RGBA', (1, SIZE))
    for y in range(SIZE):
        t = min(max((y - body[1]) / (body[3] - body[1]), 0), 1)
        gradient.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(TEAL_TOP, TEAL_BOTTOM)) + (255,))
    mask = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(body, px(radius), fill=255)
    canvas.paste(gradient.resize((SIZE, SIZE)), (0, 0), mask)

    draw = ImageDraw.Draw(canvas)

    # "HL7", centred horizontally, sitting a little above the middle.
    font = ImageFont.truetype(FONT, px(330))
    x0, y0, x1, y1 = draw.textbbox((0, 0), 'HL7', font=font)
    draw.text((SIZE / 2 - (x0 + x1) / 2, px(440) - (y0 + y1) / 2), 'HL7', font=font, fill='white')

    # The delimiter strip: a white bar holding four coloured chips, like a coloured message line.
    bar_left, bar_right, bar_top, bar_bottom = 262, 762, 630, 710
    draw.rounded_rectangle((px(bar_left), px(bar_top), px(bar_right), px(bar_bottom)), px(40), fill='white')
    gap, inset = 18, 18
    chip_width = (bar_right - bar_left - 2 * inset - 3 * gap) / 4
    for i, colour in enumerate(DELIMITERS):
        cx = bar_left + inset + i * (chip_width + gap)
        draw.rounded_rectangle((px(cx), px(bar_top + inset), px(cx + chip_width), px(bar_bottom - inset)), px(22), fill=colour)

    return canvas.resize((1024, 1024), Image.LANCZOS)


def main() -> None:
    master = draw_master()
    contents_path = os.path.join(ICONSET, 'Contents.json')
    with open(contents_path) as f:
        contents = json.load(f)
    for image in contents['images']:
        points = int(image['size'].split('x')[0])
        scale = int(image['scale'][0])
        name = f'icon_{points}x{points}{"@2x" if scale == 2 else ""}.png'
        master.resize((points * scale, points * scale), Image.LANCZOS).save(os.path.join(ICONSET, name))
        image['filename'] = name
    with open(contents_path, 'w') as f:
        json.dump(contents, f, indent=2)
        f.write('\n')
    print(f'Wrote {len(contents["images"])} icons to {os.path.relpath(ICONSET, ROOT)}')


if __name__ == '__main__':
    main()

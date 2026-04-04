#!/usr/bin/env python3
"""
Generate the slamy icon — Signal Geometry aesthetic.
512x512 PNG icon. Second pass — refined composition.
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

SIZE = 512
BG_COLOR = (20, 24, 36)
PRIMARY = (70, 145, 250)     # Signal blue
ACCENT = (40, 210, 172)      # Transmission teal
WARM = (255, 130, 70)        # Human warmth
SOFT_WHITE = (200, 210, 230) # Whisper text


def rounded_rect(draw, bbox, radius, **kwargs):
    draw.rounded_rectangle(bbox, radius=radius, **kwargs)


def lerp_color(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def create_icon():
    SCALE = 3
    S = SIZE * SCALE
    C = S // 2

    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # === BACKGROUND ===
    m = int(S * 0.03)
    bg_r = int(S * 0.19)
    rounded_rect(draw, (m, m, S - m, S - m), bg_r, fill=BG_COLOR)

    # === SUBTLE GRID ===
    grid_c = (30, 35, 50)
    spacing = S // 14
    for i in range(1, 14):
        a = spacing * i
        if int(S * 0.18) < a < int(S * 0.82):
            draw.line([(int(S * 0.18), a), (int(S * 0.82), a)], fill=grid_c, width=1)
            draw.line([(a, int(S * 0.18)), (a, int(S * 0.82))], fill=grid_c, width=1)

    # === NODE POSITIONS ===
    # A gentle cross with the center hub — echoing Slack's grid topology
    spread = int(S * 0.185)
    node_sz = int(S * 0.115)

    positions = [
        (C, C - spread),           # Top
        (C + spread, C),           # Right
        (C, C + spread),           # Bottom
        (C - spread, C),           # Left
    ]
    colors = [PRIMARY, ACCENT, WARM, PRIMARY]

    # === CONNECTION LINES (behind everything) ===
    path_c = (40, 46, 64)
    path_w = int(S * 0.007)

    # Outer ring connections
    for i in range(4):
        x1, y1 = positions[i]
        x2, y2 = positions[(i + 1) % 4]
        draw.line([(x1, y1), (x2, y2)], fill=path_c, width=path_w)

    # Cross connections through center
    draw.line([positions[0], positions[2]], fill=(35, 40, 56), width=path_w)
    draw.line([positions[1], positions[3]], fill=(35, 40, 56), width=path_w)

    # === SIGNAL DOTS on paths ===
    dot_r = int(S * 0.007)
    for i in range(4):
        x1, y1 = positions[i]
        x2, y2 = positions[(i + 1) % 4]
        mx, my = (x1 + x2) // 2, (y1 + y2) // 2
        draw.ellipse([mx - dot_r, my - dot_r, mx + dot_r, my + dot_r], fill=ACCENT)

    # === CENTER HUB ===
    hub_outer = int(S * 0.085)
    hub_inner = int(S * 0.058)
    # Outer ring
    rounded_rect(
        draw,
        (C - hub_outer, C - hub_outer, C + hub_outer, C + hub_outer),
        hub_outer // 3,
        fill=(30, 35, 50),
        outline=(55, 63, 85),
        width=int(S * 0.004),
    )
    # Inner dark
    rounded_rect(
        draw,
        (C - hub_inner, C - hub_inner, C + hub_inner, C + hub_inner),
        hub_inner // 3,
        fill=BG_COLOR,
        outline=PRIMARY,
        width=int(S * 0.005),
    )
    # Center pulse
    pr = int(S * 0.018)
    draw.ellipse([C - pr, C - pr, C + pr, C + pr], fill=ACCENT)
    # Inner glow dot
    ir = int(S * 0.008)
    draw.ellipse([C - ir, C - ir, C + ir, C + ir], fill=(140, 240, 220))

    # === FOUR SIGNAL NODES ===
    for (nx, ny), nc in zip(positions, colors):
        half = node_sz // 2
        r = int(node_sz * 0.28)

        # Shadow layer
        shadow_off = int(S * 0.005)
        shadow_c = (12, 14, 22)
        rounded_rect(
            draw,
            (nx - half + shadow_off, ny - half + shadow_off,
             nx + half + shadow_off, ny + half + shadow_off),
            r,
            fill=shadow_c,
        )

        # Main node
        rounded_rect(
            draw,
            (nx - half, ny - half, nx + half, ny + half),
            r,
            fill=nc,
        )

        # Inner highlight
        hi_margin = int(node_sz * 0.22)
        lighter = tuple(min(255, c + 50) for c in nc)
        rounded_rect(
            draw,
            (nx - half + hi_margin, ny - half + hi_margin,
             nx + half - hi_margin, ny + half - hi_margin),
            r // 2,
            fill=lighter,
        )

    # === CORNER BRACKETS ===
    bk_len = int(S * 0.035)
    bk_w = int(S * 0.004)
    bk_off = int(S * 0.09)
    bk_c = (48, 55, 75)

    for cx, cy, dx, dy in [
        (bk_off, bk_off, 1, 1),
        (S - bk_off, bk_off, -1, 1),
        (bk_off, S - bk_off, 1, -1),
        (S - bk_off, S - bk_off, -1, -1),
    ]:
        draw.line([(cx, cy), (cx + bk_len * dx, cy)], fill=bk_c, width=bk_w)
        draw.line([(cx, cy), (cx, cy + bk_len * dy)], fill=bk_c, width=bk_w)

    # === TERMINAL CURSOR below bottom node ===
    cur_w = int(S * 0.018)
    cur_h = int(S * 0.042)
    cur_x = C - cur_w // 2
    cur_y = positions[2][1] + node_sz // 2 + int(S * 0.032)
    draw.rectangle([cur_x, cur_y, cur_x + cur_w, cur_y + cur_h], fill=ACCENT)

    # === TYPOGRAPHY ===
    try:
        font_path = "/Users/tackeyy/.claude/plugins/cache/anthropic-agent-skills/document-skills/a5bcdd7e58cd/skills/canvas-design/canvas-fonts/GeistMono-Regular.ttf"
        font = ImageFont.truetype(font_path, int(S * 0.04))
    except (IOError, OSError):
        font = ImageFont.load_default()

    text = "slamy"
    tb = draw.textbbox((0, 0), text, font=font)
    tw = tb[2] - tb[0]
    tx = C - tw // 2
    ty = S - m - int(S * 0.075)
    draw.text((tx, ty), text, fill=(88, 98, 125), font=font)

    # === GLOW PASS ===
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_r = int(S * 0.045)
    glow_draw.ellipse(
        [C - glow_r, C - glow_r, C + glow_r, C + glow_r],
        fill=(40, 210, 172, 30),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=int(S * 0.025)))
    img = Image.alpha_composite(img, glow)

    # Node glows
    for (nx, ny), nc in zip(positions, colors):
        ng = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ng_draw = ImageDraw.Draw(ng)
        gr = int(S * 0.06)
        ng_draw.ellipse(
            [nx - gr, ny - gr, nx + gr, ny + gr],
            fill=(*nc, 20),
        )
        ng = ng.filter(ImageFilter.GaussianBlur(radius=int(S * 0.02)))
        img = Image.alpha_composite(img, ng)

    # === DOWNSAMPLE ===
    icon = img.resize((SIZE, SIZE), Image.LANCZOS)

    out = "/Users/tackeyy/dev/slamy/slamy-icon.png"
    icon.save(out, "PNG", optimize=True)
    print(f"Saved: {out} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    create_icon()

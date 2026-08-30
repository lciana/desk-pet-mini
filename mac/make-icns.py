# -*- coding: utf-8 -*-
"""
从现有 build/icon.ico 生成 macOS 用的 mac/icon.icns。
纯增量：只新增 icon.icns，不修改 icon.ico。

本脚本位于 mac/ 目录，ROOT 仍解析到项目根目录。

像素风图标 -> 全程 NEAREST 缩放，避免插值糊边。
Pillow 的 icns writer 需要 32/64/128/256/512/1024 六个尺寸，
通过 append_images 逐个提供（否则它会用默认插值自动 resize）。
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "build", "icon.ico")
DST = os.path.join(ROOT, "mac", "icon.icns")

SIZES = [32, 64, 128, 256, 512, 1024]

def main():
    if not os.path.exists(SRC):
        print("ERROR: 找不到源图标", SRC)
        return 1

    ico = Image.open(SRC)
    # 取 ico 内分辨率最大的一帧
    best = max(ico.info.get("sizes") or [ico.size])
    ico.size = best
    base = ico.convert("RGBA")
    base.load()
    print("source frame:", best, base.mode)

    # 以最大帧为基准，NEAREST 生成各尺寸
    images = []
    for s in SIZES:
        if base.size[0] == s:
            im = base.copy()
        else:
            im = base.resize((s, s), Image.NEAREST)
        images.append(im)
        print("  ->", s, im.size)

    # Pillow 以主图尺寸为基准写入；主图用 1024，其余靠 append_images 提供
    master = images[-1]
    master.save(DST, "icns", append_images=images[:-1])

    print("OK ->", DST, os.path.getsize(DST), "bytes")
    return 0

if __name__ == "__main__":
    sys.exit(main())

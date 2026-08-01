---
name: convert-images-to-webp
description: Webまたはアプリで使うPNG、JPEG、GIF、TIFF、BMPをWebPへ変換し、変換後のファイルを参照する。添付画像をプロジェクトへ追加するとき、またはWebP変換、画像最適化、圧縮を依頼されたときに使う。元画像は既定で残し、削除はユーザーが明示した場合だけ行う。
---

# Convert Images to WebP

Convert every in-scope raster image before referencing it from application code.

## Workflow

1. Locate the attached/local source image and determine its intended project destination.
2. Respect explicit instructions for quality, dimensions, output path, animation, or source retention.
3. Select a mode:
   - `balanced` by default for photos and general web imagery (quality 82).
   - `high` for hero images or imagery where artifacts are conspicuous (quality 88).
   - `compact` for thumbnails or bandwidth-sensitive imagery (quality 74).
   - `lossless` for logos, pixel art, diagrams, screenshots with small text, or exact-color UI assets.
4. Run `scripts/convert_to_webp.sh`. Preserve the source by default. Pass `--delete-source` only when the user explicitly asks to remove it.
5. Verify that the output exists, is non-empty, and is identified as WebP. For animated input, also verify that animation remains present.
6. Use the `.webp` output in code, markup, styles, manifests, or documentation. If deletion was explicitly requested, remove references to the source only after verification.
7. Report the output path, selected mode, and size reduction. Mention when lossless output is larger than the source.

## Commands

```bash
scripts/convert_to_webp.sh --mode balanced path/to/image.png
scripts/convert_to_webp.sh --mode lossless --output path/to/logo.webp path/to/logo.png
scripts/convert_to_webp.sh --mode balanced --delete-source path/to/remove-after-conversion.png
```

Pass `--keep-metadata` only when metadata is an explicit requirement. Do not upscale images. If resizing is requested, resize with the project's existing image tooling before conversion, then verify the final dimensions.

## Safety

- Preserve the source unless the user explicitly requested deletion.
- When deletion is requested, delete only after the converter succeeds and the WebP output passes verification.
- Never use the same path for input and output.
- Use `--force` only when the user explicitly approved overwriting that exact output file.
- Preserve animated GIFs as animated WebP with `gif2webp`.
- Treat an existing WebP input as already converted; move or use it as instructed rather than recompressing it without a stated reason.

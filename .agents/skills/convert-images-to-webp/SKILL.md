---
name: convert-images-to-webp
description: Convert attached or provided raster images to WebP, then use the converted files in websites and application development. Invoke automatically whenever a user attaches PNG, JPEG, GIF, TIFF, or BMP images for use in a web/app/code project, asks to add an attached image to a project, or explicitly requests WebP conversion, optimization, compression, or replacement. Follow any user-specified quality, dimensions, naming, destination, or source-retention instructions. Delete the source image after successful conversion and verification unless the user asks to keep it.
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
4. Run `scripts/convert_to_webp.sh`. Pass `--delete-source` unless the user asks to retain the original.
5. Verify that the output exists, is non-empty, and is identified as WebP. For animated input, also verify that animation remains present.
6. Use the `.webp` output in code, markup, styles, manifests, or documentation. Never leave a reference to the deleted source.
7. Report the output path, selected mode, and size reduction. Mention when lossless output is larger than the source.

## Commands

```bash
scripts/convert_to_webp.sh --mode balanced --delete-source path/to/image.png
scripts/convert_to_webp.sh --mode lossless --output path/to/logo.webp --delete-source path/to/logo.png
```

Pass `--keep-metadata` only when metadata is an explicit requirement. Do not upscale images. If resizing is requested, resize with the project's existing image tooling before conversion, then verify the final dimensions.

## Safety

- Delete the source only after the converter succeeds and the WebP output passes verification.
- Refuse to overwrite an unrelated existing output unless `--force` is intentional.
- Preserve animated GIFs as animated WebP with `gif2webp`.
- Treat an existing WebP input as already converted; move or use it as instructed rather than recompressing it without a stated reason.

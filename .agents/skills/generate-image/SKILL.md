---
name: generate-image
description: Manually invoked skill for planning and generating Shiftori illustrations and visual explanations. Use only when the user explicitly invokes `$generate-image`; do not invoke implicitly for ordinary UI, image, design, or development requests. Elicit the intended message and placement, recommend suitable formats from the supported catalog, let the user select one, then generate the image using `public/sample-touch.png` as a mandatory visual reference.
---

# Generate Shiftori Image

Guide the user from an unclear visual need to a selected format and generated image. Do not generate before the user chooses a proposed direction.

## Workflow

1. Confirm that `/Users/natani/work/yps-crispy-carnival/public/sample-touch.png` exists and inspect it with the image-viewing tool.
2. Ask only for missing information:
   - what the image should communicate;
   - where it will appear and the desired aspect ratio or dimensions;
   - required people, objects, steps, text, and elements to avoid.
3. Recommend two or three suitable formats from the catalog. Put the strongest recommendation first and explain each in one sentence.
4. Ask the user to select a format or adjust the proposed direction. Do not generate during this turn.
5. After selection, summarize the final direction briefly only if clarification remains necessary.
6. Generate with the image-generation tool. Always provide `public/sample-touch.png` through `referenced_image_paths`; mentioning it in the prompt alone is insufficient.
7. Follow explicit user instructions over defaults. If the output will be added to the web application, convert it with `$convert-images-to-webp` before referencing it in code.

## Format catalog

- **インフォグラフィック**: 情報、関係、数値を図解として整理する。
- **フラットイラスト**: LP向けのシンプルで平面的な場面を描く。
- **アイソメトリックイラスト**: SaaSや業務全体を斜め上から立体的に見せる。
- **スポットイラスト**: 本文や機能説明の横に置く小さな補足画像にする。
- **エディトリアルイラスト**: 記事の概念や問いを少し抽象的に表す。
- **コンセプトイラスト**: 一元管理、効率化、安心などの価値を象徴的に表す。
- **シーンイラスト**: 店長やスタッフがシフトリを使う具体的な場面を描く。
- **ステップイラスト / プロセス図**: 募集、提出、調整、確定などを順番に見せる。
- **ワークフロー図**: 人、端末、システム間のやり取りを矢印で示す。
- **Before / After図**: 導入前の課題と導入後の改善を対比する。
- **ヒーローイラスト**: LPのファーストビュー向けに価値を一枚で印象づける。
- **フィーチャーイラスト**: 機能紹介セクションごとの内容を補足する。

## Visual direction

Use the reference image as the source of truth for the visual language:

- clean white background and ample whitespace;
- friendly Japanese retail staff and managers;
- hand-drawn black outlines with slightly organic variation;
- restrained Shiftori teal accents, pale mint support shapes, and grayscale details;
- simple faces, rounded forms, approachable expressions, and uncluttered compositions;
- calendars, shift grids, smartphones, notifications, check marks, stores, and staff communication when relevant.

Keep the selected format recognizable while preserving this touch. Avoid photorealism, glossy 3D rendering, dense gradients, generic corporate stock-art styling, excessive decoration, and invented logos. Avoid text inside the image unless the user explicitly requires it; image models often render Japanese text poorly.

## Generation prompt

Include the following in the image-generation prompt:

- the selected format and intended placement;
- the communication goal and exact scene or information hierarchy;
- the required aspect ratio or dimensions;
- the reference-derived visual direction above;
- a request to preserve whitespace for adjacent copy when applicable;
- explicit exclusions, including unwanted text and visual styles.

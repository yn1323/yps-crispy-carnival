---
name: generate-image
description: シフトリ向けのイラストや図解について、用途に合う形式を提案し、ユーザーの選択後に基準画像を参照して生成する。ユーザーが`$generate-image`を明示した場合だけ使い、通常のUI、画像、デザイン、実装依頼では暗黙に使わない。
---

# シフトリ向け画像を生成する

Guide the user from an unclear visual need to a selected format and generated image. Do not generate before the user chooses a proposed direction.

## Workflow

1. Confirm that `doc/assets/article-hero-style-reference.png` exists and inspect it with the image-viewing tool.
2. If the image will contain text, read `src/configs/theme/tokens/fonts.ts` and use the application's current `heading` or `body` font stack. Treat this file as the source of truth instead of copying a font name into this skill.
3. Ask only for missing information:
   - what the image should communicate;
   - where it will appear and the desired aspect ratio or dimensions;
   - required people, objects, steps, text, and elements to avoid.
4. Recommend two or three suitable formats from the catalog. Put the strongest recommendation first and explain each in one sentence.
5. Ask the user to select a format or adjust the proposed direction. Do not generate during this turn.
6. After selection, summarize the final direction briefly only if clarification remains necessary.
7. Generate with the image-generation tool. Resolve `doc/assets/article-hero-style-reference.png` from the repository root, then pass its absolute path through `referenced_image_paths`; mentioning it in the prompt alone is insufficient.
8. Follow explicit user instructions over defaults. If the output will be added to the web application, convert it with `$convert-images-to-webp` before referencing it in code.

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

Keep the selected format recognizable while preserving this touch. Avoid photorealism, glossy 3D rendering, dense gradients, generic corporate stock-art styling, excessive decoration, and invented logos. Avoid text inside the image unless the user explicitly requires it; image models often render Japanese text poorly. When text is required, match the application's current typography from `src/configs/theme/tokens/fonts.ts`, including its fallback stack, and verify the generated glyphs and wording visually.

## Generation prompt

Include the following in the image-generation prompt:

- the selected format and intended placement;
- the communication goal and exact scene or information hierarchy;
- the required aspect ratio or dimensions;
- the reference-derived visual direction above;
- a request to preserve whitespace for adjacent copy when applicable;
- when text is required, the exact wording and the font stack read from `src/configs/theme/tokens/fonts.ts`;
- explicit exclusions, including unwanted text and visual styles.

# apps/video/AGENTS.md

このファイルは `apps/video/` 配下へ適用する。
ルートの `AGENTS.md` と併せて読む。

## 位置づけ

- このappは、シフトリの紹介動画をRemotionで制作する環境であり、利用者向けSaaS本体とは分離する。
- Remotionのcomposition、アニメーション、素材、書き出しを扱う場合は `remotion-best-practices` を使う。
- 本体のUI、Storybook、E2E、Full Regressionの対象へ混ぜない。
- 本体の共通componentやdomainを、動画だけの都合で変更しない。

## 境界

- 実在の利用者、店舗、スタッフの情報やProductionのデータを動画へ含めない。画面を映す場合はダミーデータを使う。
- 書き出した動画は `out/` へ出力し、コミットしない。
- LPに載せる版は、`out/` の書き出しからPC向けとスマホ向けを作り、`src/components/features/LandingPage/IntroVideoSection/` の動画とposterを差し替える。作り方は絵コンテの「LPへの埋め込み」を参照する。
- `remotion` と `@remotion/*` は、すべて同じバージョンへ完全一致で固定する。
- Remotionを更新する場合は、pnpmの `minimumReleaseAge` を満たすバージョンを選ぶ。`pnpm-workspace.yaml` へ `minimumReleaseAgeExclude` を追加しない。
- `remotion-best-practices` には、リポジトリ独自の `lp-product-video/` と `SKILL.md` の「Landing page product videos」節を追加している。Remotionやスキルを更新した後は、この追加が残っているか確認し、消えていればGitの履歴から復元する。

## テストと確認

- このappには新しいLogic/UI/Storybook/VRT/E2Eテストを追加しない。
- 変更時は次を実行する。

```bash
pnpm video:lint
pnpm video:type-check
```

- Remotion Studioはユーザーが起動するため、新規起動しない。

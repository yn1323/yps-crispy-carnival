# シフトリ紹介動画（Remotion）

LP・SNS向けのサービス紹介動画。**1920x1080 / 30fps / 60秒（1800フレーム）**、音声なしのテロップ主体構成。

## コマンド

```bash
pnpm video:studio   # Remotion Studioを起動（プレビュー・スクラブ）
pnpm video:render   # out/promo-video.mp4 を書き出し
pnpm video:still    # out/promo-still.png を書き出し（--frame=N でフレーム指定）
```

書き出し済みの動画は `doc/assets/promo-video.mp4` に置いてある（レビュー用のスナップショット）。
`out/` は作業用ディレクトリでgit管理外なので、更新したら `doc/assets/` にコピーし直すこと。

## 構成

| # | シーン | 尺 | 内容 |
|---|---|---|---|
| 1 | `scenes/Hook` | 5.0s | 散らかった希望シフトのやり取り →「毎月のシフト集め、まだ手作業ですか？」 |
| 2 | `scenes/Pain` | 8.5s | 終わらない3つの理由（バラバラに届く / ひとりずつ催促 / 見たか分からない） |
| 3 | `scenes/LogoReveal` | 5.5s | 散らばった要素が1点に集まる → ロゴとタグライン |
| 4 | `scenes/ThreeSteps` | 12.5s | 募集期間を決める → シフトを組む → 確定する（各カードが順に主役になる） |
| 5 | `scenes/Automation` | 10.5s | スマホ画面と連動して、回収・催促・共有の自動化を1つずつ見せる |
| 6 | `scenes/SubmissionTypes` | 8.5s | 希望の集め方3種（日ごと / 時間指定 / 勤務区分） |
| 7 | `scenes/UseCases` | 5.5s | 導入業種と、アプリ不要・無料・スマホ完結 |
| 8 | `scenes/Cta` | 7.5s | ロゴ、CTA、`shiftori.app` |

シーン長の合計は 1905 フレーム。`PromoVideo/index.tsx` の `TransitionSeries` が
15フレームのトランジション7本（105フレーム）を相殺して、ちょうど1800フレームになる。
**尺を変える場合は、シーン長の合計から105を引いた値が `theme.ts` の `VIDEO.durationInFrames` と一致すること。**

## 素材の方針

- 画像素材は `public/textlogo_black.png`（ロゴ）のみ。
- シフト表・カレンダー・LINE画面などの「記号」は、すべてRemotion内のコンポーネントとして実装している
  （`components/CalendarGrid`, `components/ShiftBoard`, `components/PhoneFrame`, `components/ChatBubble` など）。
  実画面のスクリーンショットではないため、UIを変更しても動画は壊れない。逆に、実画面と揃えたい場合は各コンポーネントを更新する。
- 色は `theme.ts` に集約。値はアプリ本体の `src/configs/theme/tokens/colors.ts` と揃えてある。

## 注意点

- **フォント**: 日本語はレンダリング環境のシステムフォントに依存する（Noto Sans JP / ヒラギノ / 游ゴシック / メイリオ）。
  日本語フォントのないマシンやCIで書き出すと豆腐になるので、その場合はフォントをインストールするか
  `@remotion/google-fonts` の導入を検討すること。
- **Remotionのライセンス**: 4名以上の企業・法人での利用にはCompany Licenseが必要（https://remotion.dev/license）。
- 文言はLP（`src/components/features/LandingPage/`）の訴求に合わせている。LPのコピーを変えたときは動画側も合わせる。

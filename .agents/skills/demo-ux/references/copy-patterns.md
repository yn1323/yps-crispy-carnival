# Demo Copy Patterns

Writing patterns for tooltips, banners, and CTAs in product tours. Includes Japanese-specific nuances.

## Universal rules

1. **≤150 characters / ≤30 words / 1 sentence per tooltip**
2. **Verb-first, second person, imperative** — "Add your first shift" not "You can add shifts here"
3. **Instructional, not narrative** — narrative fits marketing videos, not tooltips
4. **Point at the next action** — tell the user what to do, not what the feature is
5. **NN/g's 3 I's** — Inform, Influence, Interact. Each tooltip should do ≥2

## Format: verb + object (+ brief reason)

```
[Action verb] [the thing], [micro-reason if non-obvious]
```

Good:
- "Drag this bar to change the time."
- "Click the staff member to assign a shift."
- "Delete this entry — 伊藤さん is out Monday."

Bad:
- "You can drag bars to change times." (indirect, not action-oriented)
- "This is the shift editor." (labels, doesn't tell user what to do)
- "Welcome to the future of scheduling!" (marketing, not instructional)

## One idea per tooltip

A tooltip that explains three things is a tooltip that gets dismissed. If you have three things to say, you have three tooltips — or two tooltips and one checklist.

Bad (three ideas):
> バーをドラッグで時間変更できます。バーをクリックすると削除メニューが出ます。編集が終わったら確定ボタンを押してください。

Good (one idea, fires at the right moment):
> バーをドラッグして、高橋さんの終業時間を16時に変えましょう。

## Japanese-specific patterns

### 句読点と半角スペース

- **本文** (tooltip content, banner body): 句読点（、。）を普通に使う。半角スペースで区切らない
- **タイトル・見出し** (tooltip title, banner heading): 句読点なしでOK。体言止め可。半角スペースで区切ってリズムを作るのも可
- 混ぜない。タイトルで「日別 と 一覧」と書いたなら、本文では「日別で細かく、一覧で俯瞰できます。」のように明確に切り替える

### 述語終わり vs 体言止め

- タイトル: 体言止めOK（「シフトの編集」「確定ボタン」）
- 本文: 「〜できます」「〜です」のような述語終わりで書く。本文で体言止めを多用すると硬く、リズムが悪い

### 擬音語・抽象語に注意

- 「ぱっと」「さらっと」「ちゃちゃっと」「すぐに」「きれいに」は、響きはよくても**具体的な情報を運ばない**
- 「ぱっと伝わります」より「スタッフ全員に送信されます」
- 「さらっと見られます」より「30秒で要点が見られます」
- 使う前に「何をどうするのか」で言い換えられないか考える

### トーン

- ですます調は固すぎない程度で使う。タメ口は避ける
- 「ご案内します」「お願いします」は一段フォーマル。中間トーンなら「案内します」「〜してください」
- 謙譲語・尊敬語の過剰使用は避ける

## Specific tooltip archetypes

### 導入ステップ (welcome)

- 1文、何ができるかを予告、次の行動へ誘導
- 「自由に触れるデモです。最初の1日を整えてみましょう。」

### アクションステップ (action-prompt)

- **どの要素を・何をするか・なぜか（あれば）**
- 「高橋さんのバーを16時までドラッグしてください。朝9時から11時間は長すぎます。」
- ハイライトされているからユーザーは対象を見つけられる前提で、指示を明確に

### 遷移ステップ (transition / summary)

- 完了したことを短く認め、次へ誘導
- 「3クリックで整いました。最後に確定ボタンを押しましょう。」

### 終了ステップ (end / CTA)

- 1文で体験を言語化、CTA はボタン側に任せる
- 「実際のお店でも、同じように整えられます。」＋ [自分のお店で始める] [もう少し触る]

## CTA wording

| Tone | Examples | When |
|---|---|---|
| Low-commitment | "もう少し触る" / "Keep exploring" | Pair with high-commitment on final step |
| High-commitment | "自分のお店で始める" / "Start free" | Primary end-of-tour CTA |
| Informational | "詳しく見る" / "Learn more" | High CTR, lower conversion — use when intent is unclear |

- **"Learn more" CTR ~63% / "Book a demo" ~41%**. Higher CTR ≠ higher qualified conversion. Match wording to the commitment level you actually want.

## Banner / Invite card copy (non-tour entry)

For a dismissible card that invites the user to start the tour from the sandbox:

- **Headline** (short, may be体言止め): 「月曜のシフト、違和感ありますか？」「Try the 30-second walkthrough」
- **Body** (1 sentence, instructional): 「3クリックで整えてみましょう。」「Watch the 3 things to fix, then do them yourself.」
- **Primary button**: action verb + object: 「整える →」「Start walkthrough」
- **Secondary / dismiss**: low-friction: 「自分で触る」「Maybe later」

## Reset / confirmation copy

- **Button label**: "Reset demo" / "最初からやり直す"  (avoid "Delete" — implies destroying real data)
- **Confirmation**: 1 sentence that names what's lost and reassures about real data
  - "デモの操作内容がクリアされます。よろしいですか？"
  - "Your demo progress will be cleared. No real data is affected."
- Single-step. No typed confirmation — this is a sandbox.

## Skip tour copy

- Label: "スキップ" / "Skip tour" / "自由に触る" / "ガイドなしで試す"
- Should never imply data loss ("Exit" or "Close" are fine; "Cancel" is ambiguous)
- Keep adjacent to step counter: `3 / 5  [スキップ]` so the user can trade "3 more → done" vs. "skip"

## A/B hypothesis to test (when you have traffic)

- Verb-first vs noun-first tooltip opens
- "Start tour" vs product-specific wording ("最初の1日を整える")
- Inline CTA in last tooltip vs full-screen celebration modal
- Persistent top-bar CTA on/off
- Video fallback vs dead-end on mobile

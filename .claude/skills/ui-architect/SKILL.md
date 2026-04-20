---
name: ui-architect
description: UI/UX実装・提案時に必ず使う汎用UI設計スキル。ユーザーのやりたいことを「タスク → 画面構造 → コンポーネント → レイアウト → 状態 → コピー」に分解し、CSSフレームワーク（主にChakra UI v3 + プロジェクトの`src/components/ui/`ラッパー）のどの部品をどう組み合わせれば最短で伝わるUIになるかを判断する。見せ方のプロとして情報設計・視覚階層・インタラクションの最適解を選ぶ。**UIに触る全ての作業で呼ばれる**：新規画面・フォーム・ダイアログ・一覧・カード・ダッシュボード・ナビ・空状態・ローディング・モバイル対応・コンポーネント選定・レイアウトのバランス・「これどう見せればいい？」系の相談。トリガー例「画面作って」「UI実装」「UI提案」「どのコンポーネント使う？」「モーダルにする？」「レイアウトどうする？」「このUIどう？」「もっと良い見せ方ない？」「どう配置する？」「build a UI」「what component」「how to lay out」「modal or drawer」。他スキルと補完関係：`/create-design`（pencilでモック）、`/design-ideas`（既存UI微調整）、`/ux-writing`（文言）、`/demo-ux`（デモ体験）と連携する。
---

# UI Architect

UIに触る前に**必ずこのワークフローを通す**。コードを書き始める前に、最低でも「ゴール分解」と「コンポーネント選定」は明示的に言語化すること。頭の中で済ませない — 決めたことを短くユーザーに共有してから実装する。

> **この職能の本質**: ユーザーのタスクを翻訳して、人間が迷わず達成できる形に落とす。カッコよさより、使いやすさ・伝わりやすさ・速さが最上位。見た目を考えるのは最後。

---

## ワークフロー（順守）

### ① ゴール分解 → ② 情報アーキテクチャ → ③ コンポーネント選定 → ④ レイアウト・視覚階層 → ⑤ 状態設計 → ⑥ マイクロコピー → ⑦ 実装 → ⑧ 触って検証

### ① ゴール分解

ユーザーの要求を以下に分ける：

- **プライマリータスク**（1画面1つ）: ここに来て一番やりたい行動
- **セカンダリータスク**: 補助・副次的な行動
- **捨てるタスク**: この画面ではやらせないこと
- **ユーザーコンテキスト**: 誰が / 何回 / どのデバイス / どんな心理状態
- **データ形状**: 1件 or 多件 / 読み中心 or 編集中心 / 静的 or 頻繁更新

プライマリーが2つ以上ある画面は分解失敗。分割 or 1つを主、残りを従に格下げ。詳細 → `references/decomposition.md`

### ② 情報アーキテクチャ（IA）

データ形状と利用頻度からページ骨格を決める：

| シナリオ | 骨格 |
|---|---|
| 単一タスク集中（フォーム・読み物） | 中央1カラム（フォーム≤640px / 読み物≤720px） |
| ダッシュボード | KPIカード帯 + グラフ + 詳細テーブルの12カラムグリッド |
| 詳細表示（マスタ1件） | ヘッダー + 本文2カラム or タブ切替 |
| エディタ系 | 左ナビ + 中央キャンバス + 右プロパティ |
| 一覧 → 詳細 | リスト + ドリルダウン（or 選択行 + 右プレビュー） |
| モバイル全般 | 縦スタック + 下部固定CTA or BottomSheet |

詳細 → `references/layout.md`

### ③ コンポーネント選定

タスクごとに下の判定ツリーで決める。迷ったら `references/components.md` と `references/chakra-v3.md`。

### ④ レイアウト・視覚階層

- **1画面1つの主役**：最優先アクションをサイズ・色・位置で明示する。残りはsecondary/ghostに落とす。
- **F字・Z字スキャン**：左上〜右下の目線に、重要情報 → アクションの順に置く。
- **近接・整列**：関係するものは近く、関係ないものは離す。縦軸 or 横軸いずれかで揃える（バラバラにしない）。
- **8ptグリッド**：4/8/12/16/24/32/48/64 以外の間隔は使わない。
- **タイポ階層**：3段階が上限（H1 / H2 / Body）。サイズ・太さ・色のどれかで差をつける。全部変えない。
- **色は意味**：装飾に色を使わない。ブランド・状態・アクション・中立の4カテゴリのみ。詳細→ `references/layout.md`

### ⑤ 状態設計（**必ず全部書く**）

- Loading（Skeletonが第一候補、Spinnerは最後の手段）
- Empty（初回・検索ゼロ件・クリア済みで出し分け）
- Error（フィールド/セクション/ページの3レベル）
- Success（Toastか永続バナーか、インラインチェックか）

詳細 → `references/states.md`

### ⑥ マイクロコピー

ボタン・ラベル・エラー・空状態・Toast・確認ダイアログは `/ux-writing` に委譲。ただし最低限：

- ボタン：動詞+目的語（「保存」より「変更を保存」）。「OK」禁止。
- 破壊的操作：結果を具体的に書く（「本当に？」ではなく「このシフトを削除します」）
- エラー：何が / なぜ / 次どうする の3点。
- 空状態：事実＋次の一歩。

### ⑦ 実装

- プロジェクト規約（下記「プロジェクト固有ルール」）を守る。
- Chakra UI v3 プリミティブ + `src/components/ui/*` ラッパーを優先。既存ラッパーがあるのに自作しない。
- フォームは react-hook-form + zodResolver、Submitは常にenabled、バリデーションは押下後。

### ⑧ 検証

- Storybookで状態ごと（loading/empty/error/success）を見る。
- 複雑な動きがあればInteractive Storyで操作テストを書く。
- モバイルビュー / デスクトップビュー両方で確認。
- 必要ならPlaywright MCPやStorybook MCPでスクショ。

---

## クイック判定ツリー（頻出）

### 選択肢を選ばせたい

| 状況 | 部品 |
|---|---|
| ON/OFF の設定（即時反映） | `Switch` |
| 同意・チェック付与（明示確定） | `Checkbox` |
| 2〜5択・排他・全選択肢見せたい | `SegmentedControl` / `RadioGroup` |
| 6〜10択・排他 | `Select` |
| 11+択・排他・検索したい | `Combobox`（検索付き） |
| 複数選（少・全部見せたい） | `CheckboxGroup` |
| 複数選（多・タグ追加的） | `MultiCombobox` / `TagInput` |
| 数値（小範囲・段階的） | `NumberInput` / `Slider` |
| 数値（大範囲・自由入力） | `Input type=number` |
| 日付（単日） | `DatePicker` |
| 日付（期間） | `DateRangePicker` + プリセットchips（今日/今週/今月） |
| 時刻 | `TimePicker` or 分割Input（hh / mm） |

Hickの法則：選択肢が増えるほど決定は遅くなる。11+はデフォルト値 or カテゴリで分ける。

### 入力・編集をどこに置く？

| 状況 | 置き場所 |
|---|---|
| 1〜3項目のインライン修正 | `Popover` / インライン編集 |
| 4〜10項目の作成・編集 | `Dialog`（Desktop） / `BottomSheet`（Mobile） |
| 11項目+ or 段階的入力 | 専用ページ or `Drawer`（右） |
| 破壊的操作の確認 | `AlertDialog`（赤ボタン、結果明示） |
| コンテキストアクション | `Menu` / `Popover` |
| 永続フィードバック | `Banner` / `Alert` |
| 非ブロッキング完了通知 | `Toast` |

詳細 → `references/navigation-containers.md`

### データを見せたい

| データ形状 | 部品 |
|---|---|
| 同種で多属性・比較・ソート | `Table` |
| 単純で主属性1つ+アクション | `List`（行） |
| 不均質・視覚・ブラウズ | `Card` list |
| 視覚的に同等・一覧性 | `Grid of cards` |
| 時系列 | `Timeline` / `Feed` |
| 階層構造 | `Tree` |
| ワークフロー状態 | `Kanban` |
| スケジュール | `Calendar` |
| メトリクス・サマリー | `KPI Card` + `Chart` |

詳細 → `references/data-display.md`

### フィードバック・モードレス

| 状況 | 部品 |
|---|---|
| ヘルプ・説明（hover） | `Tooltip`（非インタラクティブ） |
| リッチなヘルプ・補足UI | `Popover` / `HoverCard` |
| 小さな状態ラベル | `Badge` / `Tag` / `Chip` |
| 進行度（既知） | `Progress`（線） / `Stepper` |
| 進行度（不明） | `Spinner` / `Skeleton` |
| 一時的成功・失敗通知 | `Toast` |
| 画面全体に関わる注意 | `Banner` |

---

## アンチパターン（実装前に自己チェック）

- ❌ **モーダル乱用**：ページ遷移で済むことをモーダルに詰める。深い編集・長尺フォームはページ or Drawer
- ❌ **ボタンが全部同じウェイト**：プライマリが1つ、残りsecondary/ghost
- ❌ **ラベルなしアイコン**：初見で意味わからないアイコンはラベルorTooltip必須
- ❌ **空状態なし**：初回ユーザー詰む。必ず"事実+次の一歩"を用意
- ❌ **スピナーだけ**：何が起きてるか不明。`Skeleton`でレイアウト保持
- ❌ **プレースホルダー=ラベル**：入力中に消える。ラベルは常に見せる
- ❌ **モバイルで多カラムフォーム**：親指が届かない。1カラム基本
- ❌ **影の氾濫**：elevationは`base`と`raised`の2段階が限度
- ❌ **色の乱用**：決めた意味の色以外を足さない（プロジェクト規約下記）
- ❌ **3フォントファミリー以上**：基本1、最大2
- ❌ **変数の不一致**：font-size 13pxや17pxなどトークン外の値を使う
- ❌ **中央寄せ羅列**：左寄せで揃える方が読みやすい（カード中心寄せは装飾時のみ）
- ❌ **枠線の二重化**：ヘッダー下線 + カード枠線が重なる → 片方消す
- ❌ **カードが全部同じ**：均質グリッドは情報階層を殺す。大小混在を許す
- ❌ **フォームのインライン2カラム**：例外（CC有効期限、郵便番号+住所）を除き縦1カラム
- ❌ **確認ダイアログの「本当に？」**：結果を書く（"3件のシフトを削除します"）
- ❌ **破壊的ボタンがプライマリ配色**：`colorPalette="red"` + 右端がほぼ必須
- ❌ **情報詰め込み**：画面に10以上の焦点 → Miller's Law違反、分割

詳細 → `references/anti-patterns.md`

---

## プロジェクト固有ルール（このリポジトリで絶対）

### フレームワーク・コンポーネント

- **Chakra UI v3 + `src/components/ui/*`**（BottomSheet / Dialog / Empty / FormCard / FullPageSpinner / InfoGuide / LazyShow / LoadingState / Select / Title / toaster / tooltip / Tour）
- 既存ラッパーがあるのに自作しない。迷ったら `references/chakra-v3.md` を確認
- Select × モーダル/BottomSheet内：`usePortal={false}`
- BottomSheetがドロップダウンをクリップ：`overflowY="visible"`
- Icons: 既存の `react-icons` を踏襲（独自SVGを足す前に確認）

### 色・状態

- `teal` = ブランド・主アクション
- `orange` = 要対応・警告
- `green` = 達成・完了
- `gray` = 中立・完了済み・非アクティブ
- `red` = 削除・エラー
- `yellow` はほぼ使わない

### 状態管理・データ

- Jotai atoms（`selectedShopAtom`, `userAtom`）
- Convex `useQuery`はpages層、`useMutation`はfeatures層
- pagesでエラー/ローディング/正常振り分け、正常系のみfeaturesを呼ぶ

### フォーム

- react-hook-form + zodResolver
- Submitは常にenabled、エラーは押下後
- mutation Zodスキーマは `convex/{useCase}/schemas.ts` 起点

### 日付

- `dayjs`必須。`new Date().toISOString()`によるYYYY-MM-DD生成は禁止（TZずれ）
- Convex層はdayjs不可なので文字列比較（"YYYY-MM-DD"）

### MVP段階

- SideMenuは含めない（BottomMenuのみ）
- 大きく不確実なUIは pencilで作り込まず**プレースホルダーパターン**で

### 文言

- タイトル・サブタイトル：句読点なし・半角スペース区切りOK
- 本文：句読点あり・体言止め多用しない・「〜できます。」で具体的に
- 詳細は `/ux-writing`

### Storybook

- `@storybook/react-vite` を使う（`@storybook/react`ではない）
- `@storybook/test` はない。コールバックは `() => {}`
- 小さなコンポーネントはVariants Story 1つに集約（VRT節約）
- 大きなコンポーネントはそのまま、必要ならInteractive Storyを別途

---

## 他スキルとの分担

| やりたいこと | 使うスキル |
|---|---|
| 新しい画面・機能のUI戦略・コンポーネント選定・骨格 | **ui-architect（これ）** |
| pencilでモック・デザインカンプを作る | `/create-design` |
| 既存UIを1コンポーネント単位で磨く | `/design-ideas` |
| LP・マーケ・ビジュアル重視のフロントを作る | `frontend-design` |
| ボタン・エラー・FAQなどの文言 | `/ux-writing` |
| 未ログインの体験版・オンボーディングツアー | `/demo-ux` |
| 設計判断で複数案を議論 | `/discuss` |

ui-architectは**すべてのUI作業の土台**。他スキル呼び出し時も判定ツリーとアンチパターンは適用する。

---

## リファレンス（必要時に読む）

- `references/decomposition.md` — ゴール分解の詳細・ヒアリング手順・代表例
- `references/layout.md` — IA・グリッド・タイポ・スペーシング・カラー階層
- `references/components.md` — コンポーネント選定の全判定ツリー（フレームワーク非依存）
- `references/forms.md` — フォーム設計パターン（ラベル・バリデーション・多段・モバイル）
- `references/data-display.md` — 一覧・テーブル・ダッシュボード・フィルタ・ページング
- `references/navigation-containers.md` — ナビ・モーダル/ドロワー/BottomSheet・トースト
- `references/states.md` — Loading/Empty/Error/Success/Skeleton/楽観更新
- `references/anti-patterns.md` — 詳細アンチパターン集
- `references/chakra-v3.md` — Chakra UI v3 ↔ カテゴリのマッピング・プロジェクトラッパー
- `references/laws-of-ux.md` — UX原則（Fitts / Hick / Miller / Gestalt / Peak-end等）の実践運用

使い分け：
- 迷ったコンポーネント選定 → `components.md` + `chakra-v3.md`
- レイアウトのバランスが悪い → `layout.md`
- フォームを作る → `forms.md`
- 一覧・テーブル・ダッシュボード → `data-display.md`
- モーダル vs Drawer vs ページで迷う → `navigation-containers.md`
- 空状態・ローディングをどうするか → `states.md`
- 「なんかしっくりこない」 → `anti-patterns.md` + `laws-of-ux.md`

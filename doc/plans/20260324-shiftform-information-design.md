# ShiftForm 情報設計改善プラン

## 背景・課題

ShiftFormのPC DailyViewは機能は揃っているが、初見ユーザーにとって操作が直感的でなく、情報量が多すぎてUXが悪い。ITリテラシーが低い店長層（Excel程度）でも迷わず使えるレベルを目指す。

主な課題：
- ツールモード（select/assign）の切り替えが意味不明
- undo/redoなどパワーユーザー向け機能がフラットに並んでいる
- 充足度が30分刻み×全時間帯の色グラデーションで読み解けない
- 充足度の入力（曜日×30分刻み=182マス）が重すぎて使われない
- 休憩のUI表現が曖昧（空白＝休憩？割り当て忘れ？）
- Overview↔Dailyの役割分担が不明確

## 方針

Progressive Disclosure（段階的開示）の原則に基づき、初見でも迷わない最小限のUIをデフォルトにする。将来のAI自動割当（直近1-2ヶ月の実績ベース）を見据えつつ、今回は手動割当のUX改善に集中する。

## 設計決定事項

### 1. PositionToolbar の簡素化

**Before:** undo/redo + ツールモード切替（select/assign）+ ポジションボタン群
**After:** ポジション選択ボタンのみ

- **select モード廃止**: スクロールはマウスホイール/スクロールバーで対応。将来D&D移動が必要になったら改めて設計
- **undo/redo 廃止**: 間違えたら上書きペイント or Popoverから削除で対応。塗り直しのほうが直感的
- **休憩ボタンは区切り線で分離**: ポジション（仕事）と休憩は概念が違うことをUIで表現

```
Before: [← →] [Select | Assign] [ホール] [レジ] [キッチン] [休憩]
After:  [ホール] [レジ] [キッチン]  |  [☕休憩]
```

### 2. 休憩の自動挿入

- ポジション間に空き時間がある場合、**自動で休憩バーを挿入**
- 対象: 最初のポジションのstartから最後のポジションのendの間の空きのみ（出勤前・退勤後は対象外）
- 見た目: ストライプやハッチング等で他ポジションと差別化
- 手動でリサイズ・上書きも可能（休憩時間を変えたいケース）
- ツールバーの休憩ボタンも残す（空きなしで直接塗りたいケース用）

```
[■ホール 10:00-13:00■][░休憩 13:00-14:00░][■レジ 14:00-18:00■]
                         ↑ 自動挿入、ストライプで差別化
```

**メリット:**
- 空白 = 常に「割り当て忘れ」を意味するようになる（曖昧さ解消）
- 勤務枠のデータモデル変更なしで、暗黙的に勤務時間が決まる

### 3. 充足度の入力簡素化

**Before:** 曜日×30分刻みで全時間帯の必要人数（182マス）
**After:** ピーク帯定義 + 最低人員

```
ピーク帯①: ランチ 11:00-14:00 → 5人必要
ピーク帯②: ディナー 17:00-21:00 → 8人必要
最低人員: 常に最低3人
```

- ピーク帯の数・時間帯は店舗ごとにカスタム可能
- 入力項目: 5-10項目（182マス → 大幅削減）

### 4. 充足度の表示改善

**Before:** 30分刻み×全時間帯の6色グラデーション（SummaryRow）
**After:** ピーク帯ベースのアラート表示

**DailyView（グリッド上部）:**
```
⚠️ ランチ帯 あと1人 ／ ディナー帯 ✅
```
- 不足時: ⚠️ + 「あと○人」（目立たせる）
- 充足時: ✅のみ（控えめ）
- リアルタイム更新（割当操作のたびに再計算）

**OverviewView（日付列）:**
- 日単位の⚠️/✅バッジ → クリックでDailyViewへ遷移

### 5. DateTabs の改善

タブ形式は維持。状態バッジと曜日・休日表示を追加。

```
[3/1(土)] [3/2(日)] [3/3(月)⚠️] [3/4(火)✅] [3/5(水)] ...
  青文字    赤文字    黒文字       黒文字      黒文字
```

| タブ状態 | 条件 | 見た目 |
|---------|------|--------|
| 未着手 | 誰にも割当なし | バッジなし |
| ⚠️不足 | ピーク帯の必要人数 or 最低人員を満たしてない | ⚠️バッジ |
| ✅OK | 全ピーク帯 + 最低人員クリア | ✅バッジ |

- 土曜: 青文字、日曜・祝日: 赤文字、平日: 黒文字

### 6. Overview↔Daily の役割明確化

| View | 役割 | 主な操作 |
|------|------|---------|
| DailyView | 作業場（割当を「する」画面） | ドラッグでポジション割当・修正 |
| OverviewView | チェック場（全体を「見る」画面） | 充足状況確認、問題日の発見→DailyViewへ遷移 |

- OverviewViewの日付⚠️バッジをクリック → その日のDailyViewに遷移
- OverviewViewは閲覧専用のまま維持

### 7. ShiftPopover（維持）

- 左クリックでシフトバーをクリック → Popover表示
- 内容: 申請状況 + ポジション一覧（個別削除）+ 全ポジション削除
- 変更なし

### 8. スタッフ名クリック

**Before:** StaffEditModal（スタッフ情報の編集可能）
**After:** 参照情報のみ表示（スキル、希望、契約情報など）。編集は不可

### 9. 将来のAI自動割当への備え

- 直近1-2ヶ月の実績データをベースにAIがシフト案を生成
- OverviewView = AI案の全体プレビュー確認
- DailyView = AI案の微調整
- 今回の情報設計はこのフローと矛盾しない（0から手動で組む場合も、AI案を微調整する場合も同じUI）

## 実装ステップ

### Step 1: PositionToolbar 簡素化
- selectモード関連コード削除（toolModeAtom, useScrollDrag等）
- undo/redo関連コード削除（useUndoRedo, shiftsHistoryAtom等）
- ツールバーUI: ポジションボタンのみ + 休憩を区切り線で分離
- 対象ファイル:
  - `src/components/features/Shift/ShiftForm/pc/DailyView/PositionToolbar.tsx`
  - `src/components/features/Shift/ShiftForm/stores.ts`
  - `src/components/features/Shift/ShiftForm/hooks/useUndoRedo.ts`（削除候補）
  - `src/components/features/Shift/ShiftForm/pc/DailyView/hooks/useDrag.ts`
  - `src/components/features/Shift/ShiftForm/pc/DailyView/hooks/useScrollDrag.ts`（削除候補）

### Step 2: 休憩の自動挿入
- normalizePositions or 新関数で、ポジション間の空きに休憩バーを自動挿入するロジック追加
- 休憩バーの見た目差別化（ストライプ/ハッチング）
- 対象ファイル:
  - `src/components/features/Shift/ShiftForm/utils/shiftOperations.ts`
  - `src/components/features/Shift/ShiftForm/pc/DailyView/ShiftGrid/ShiftBar.tsx`

### Step 3: 充足度の入力簡素化
- ピーク帯定義 + 最低人員のデータモデル設計
- 店舗設定画面にピーク帯設定UIを追加
- 対象ファイル:
  - `convex/schema.ts`（requiredStaffingテーブル変更）
  - `convex/requiredStaffing/`（queries/mutations更新）
  - 店舗設定画面の該当コンポーネント

### Step 4: 充足度の表示改善
- DailyView上部にピーク帯アラート表示コンポーネント追加
- OverviewViewの日付セルに⚠️/✅バッジ追加
- 既存SummaryRowの置き換え or 簡素化
- 対象ファイル:
  - `src/components/features/Shift/ShiftForm/pc/DailyView/index.tsx`
  - `src/components/features/Shift/ShiftForm/pc/DailyView/SummaryRow.tsx`
  - `src/components/features/Shift/ShiftForm/pc/OverviewView/index.tsx`
  - `src/components/features/Shift/ShiftForm/pc/OverviewView/SummaryFooterRow.tsx`
  - `src/components/features/Shift/ShiftForm/utils/calculations.ts`

### Step 5: DateTabs 改善
- タブに充足状態バッジ（⚠️/✅）追加
- 曜日表示 + 休日フォント色（土:青、日祝:赤）
- 対象ファイル:
  - `src/components/features/Shift/ShiftForm/pc/DailyView/DateTabs.tsx`
  - `src/components/features/Shift/ShiftForm/utils/dateUtils.ts`

### Step 6: Overview→Daily 遷移強化
- OverviewViewの日付クリックでDailyViewの該当日に遷移
- 対象ファイル:
  - `src/components/features/Shift/ShiftForm/pc/OverviewView/index.tsx`
  - `src/components/features/Shift/ShiftForm/pc/OverviewView/StaffRow.tsx`
  - `src/components/features/Shift/ShiftForm/stores.ts`

### Step 7: スタッフ名クリック → 参照のみ
- StaffEditModalを参照専用に変更（編集ボタン・保存機能を除外）
- 対象ファイル:
  - `src/components/features/Shift/ShiftForm/pc/DailyView/index.tsx`
  - `src/components/features/Staff/StaffEditModal/index.tsx`（or 新しい参照専用コンポーネント）

## 参考ファイル

- `src/components/features/Shift/ShiftForm/types.ts` — 全ドメイン型定義
- `src/components/features/Shift/ShiftForm/stores.ts` — Jotai atoms（状態管理の中心）
- `src/components/features/Shift/ShiftForm/constants.ts` — 時間軸定数、色定義
- `src/components/features/Shift/ShiftForm/utils/shiftOperations.ts` — シフト操作ロジック（paint, resize, normalize等）
- `src/components/features/Shift/ShiftForm/utils/calculations.ts` — 充足度計算ロジック
- `src/components/features/Shift/ShiftForm/pc/DailyView/index.tsx` — DailyViewメインコンポーネント
- `src/components/features/Shift/ShiftForm/pc/DailyView/ShiftGrid/index.tsx` — グリッド本体
- `src/components/features/Shift/ShiftForm/pc/OverviewView/index.tsx` — OverviewViewメインコンポーネント
- `convex/schema.ts` — DBスキーマ（requiredStaffing等）

## 議論で出た懸念点・注意事項

- **将来のAI自動割当**: 直近1-2ヶ月の実績ベースでAIがシフト案を生成する構想あり。今回の設計はこれと矛盾しない（DailyView=微調整、OverviewView=全体確認のフローが共通）
- **ピーク帯設定のカスタマイズ性**: 業態によってピーク帯の数・時間帯が異なる（カフェ: モーニング/ランチ/ティータイム等）。店舗ごとにカスタム可能にする
- **selectモード廃止後のD&D**: 将来「シフトを掴んで別の時間帯に移動」が必要になった場合、その時点で改めてUI設計する（YAGNIの原則）
- **undo/redo廃止のリスク**: 大量の割当を間違えて消した場合の救済手段がなくなる。ただし、Convexへの保存は明示的操作なので、保存前ならリロードで復元可能
- **休憩自動挿入のエッジケース**: 30分の空き（=timeRange.unit）でも休憩として自動挿入する。意図しない挿入が起きないか要テスト

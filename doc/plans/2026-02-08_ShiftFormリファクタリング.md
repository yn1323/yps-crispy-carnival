# ShiftForm リファクタリング 実装計画

**作成日**: 2026-02-08
**機能仕様書**: `doc/spec/2026-02-08_シフト編集機能仕様.md`

---

## 1. 背景と目的

### 1.1 現状の課題

ShiftViewSwitcher (PC) と ShiftViewSwitcherSP (SP) が**ほぼ同一の状態管理ロジック**を持ち、
型定義・ユーティリティ・UIコンポーネントが複数箇所に散在している。

- **全体**: 約45ファイル（stories/test除く）、コード総量 10,000行超
- **ShiftTableTest/index.tsx**: 656行に、ドラッグ・スクロール・ポップオーバー・カーソル管理が混在
- **消費元**: 現在 stories のみ（pages層からの利用はまだなし）→ リスク低

### 1.2 目的

- `ShiftForm` を単一トップレベルコンポーネントとして統合
- Jotai Provider でスコープした状態管理で **props drilling を解消**
- 重複コード（4箇所の `timeToMinutes`、2つの `SortMenu`、同一状態ロジック）を統合
- ShiftTableTest を責務ごとに分割し保守性を向上

---

## 2. 現状の詳細調査結果

### 2.1 移行対象ファイル一覧

#### ShiftViewSwitcher/ (PC トップレベル)
| ファイル | 行数 | export | 責務 |
|---------|------|--------|------|
| `index.tsx` | 125 | `ShiftViewSwitcher` | ビュー切替 + 状態管理 + キーボードショートカット |
| `types.ts` | 14 | `ShiftViewSwitcherBaseProps` | 共通Props型定義 |
| `index.stories.tsx` | - | - | Storybook |

#### ShiftViewSwitcherSP/ (SP トップレベル)
| ファイル | 行数 | export | 責務 |
|---------|------|--------|------|
| `index.tsx` | 104 | `ShiftViewSwitcherSP` | ビュー切替 + 状態管理 + Undo/Redo UI |
| `index.stories.tsx` | - | - | Storybook |

#### ShiftTableTest/ (PC 日毎ビュー)
| ファイル | 行数 | export | 責務 |
|---------|------|--------|------|
| `index.tsx` | 656 | `ShiftTableTest` | PC日毎ビュー全体（要分割） |
| `types.ts` | 109 | 多数（下記参照） | 中核型定義（他コンポーネントの参照元） |
| `constants.ts` | 3 | `RESIZE_EDGE_THRESHOLD` | リサイズ判定閾値 |
| `PositionToolbar.tsx` | 136 | `PositionToolbar` | Undo/Redo + ツールモード + ポジション選択 |
| `DateTabs.tsx` | 43 | `DateTabs` | 日付選択タブ |
| `SortMenu.tsx` | 53 | `SortMenu` | ソートUI（**ShiftOverviewと重複**） |
| `TimeHeader.tsx` | 37 | `TimeHeader` | 時間軸ヘッダー |
| `GridLines.tsx` | 34 | `GridLines` | 時間軸グリッド線 |
| `ShiftBar.tsx` | 233 | `ShiftBar` | ポジションバー（ホバー/クリック） |
| `DragPreview.tsx` | 83 | `DragPreview` | ドラッグフィードバック |
| `ShiftPopover.tsx` | 166 | `ShiftPopover` | ポジション詳細/削除ポップオーバー |
| `SummaryRow.tsx` | 272 | `SummaryRow` | 充足度サマリーフッター |
| `hooks/useUndoRedo.ts` | 90 | `useUndoRedo` | Undo/Redo履歴管理（max 50） |
| `hooks/useKeyboardShortcuts.ts` | 39 | `useKeyboardShortcuts` | Ctrl+Z/Y（**移行対象外**） |
| `hooks/useDrag.ts` | 437 | `useDrag` | ドラッグ/ペイント/消去/リサイズ |
| `utils/shiftOperations.ts` | 564 | 17関数 | コア操作ロジック |
| `utils/shiftOperations.test.ts` | - | - | テスト |
| `utils/sortStaffs.ts` | 100 | `sortStaffs` | スタッフソートロジック |
| `index.stories.tsx` | - | - | Storybook |

#### ShiftOverview/ (PC 俯瞰ビュー)
| ファイル | 行数 | export | 責務 |
|---------|------|--------|------|
| `index.tsx` | 102 | `ShiftOverview` | PC俯瞰ビュー全体 |
| `types.ts` | 117 | 9型 | 俯瞰ビュー型定義（ShiftTableTest/typesを再export含む） |
| `constants.ts` | 9 | 6定数 | セル幅/高さ/アラート閾値 |
| `SortMenu.tsx` | 53 | `SortMenu` | ソートUI（**ShiftTableTestと100%重複**） |
| `OverviewHeader.tsx` | 109 | `OverviewHeader` | 日付/月ヘッダー |
| `StaffRow.tsx` | 135 | `StaffRow` | スタッフデータ行 |
| `MonthSummaryCell.tsx` | 29 | `MonthSummaryCell` | 月別合計セル |
| `SummaryFooterRow.tsx` | 192 | `SummaryFooterRow` | 充足度合計フッター |
| `utils/calculations.ts` | 143 | 6関数 | 俯瞰計算ロジック |
| `utils/calculations.test.ts` | - | - | テスト |
| `utils/dateUtils.ts` | 105 | 10関数 | 日付ユーティリティ |
| `index.stories.tsx` | - | - | Storybook |

#### ShiftDailyCardSP/ (SP 日毎ビュー)
| ファイル | 行数 | export | 責務 |
|---------|------|--------|------|
| `index.tsx` | 207 | `ShiftDailyCardSP` | SP日毎ビュー全体 |
| `types.ts` | 65 | 6型 | SP日毎Props型 |
| `DateNavigator.tsx` | 45 | `DateNavigator` | 日付前後ナビ |
| `StaffCard.tsx` | 77 | `StaffCard` | スタッフカード |
| `MiniShiftBar.tsx` | 62 | `MiniShiftBar` | ミニポジションバー |
| `ShiftEditSheet.tsx` | 262 | `ShiftEditSheet` | 編集BottomSheet |
| `ShiftDetailSheet.tsx` | 62 | `ShiftDetailSheet` | 閲覧BottomSheet |
| `StaffAddSheet.tsx` | 67 | `StaffAddSheet` | スタッフ追加BottomSheet |
| `index.stories.tsx` | - | - | Storybook |

#### ShiftOverviewCardSP/ (SP 俯瞰ビュー)
| ファイル | 行数 | export | 責務 |
|---------|------|--------|------|
| `index.tsx` | 187 | `ShiftOverviewCardSP` | SP俯瞰ビュー全体 |
| `types.ts` | 30 | 2型 | SP俯瞰Props型 |
| `DateCard.tsx` | 104 | `DateCard` | 日付カード |
| `index.stories.tsx` | - | - | Storybook |

### 2.2 重複コード詳細

#### timeToMinutes() — 4箇所に存在

| 場所 | scope | 実装 |
|------|-------|------|
| `ShiftTableTest/utils/shiftOperations.ts:13-16` | **exported** | `const [hours, minutes] = time.split(":").map(Number); return hours * 60 + minutes;` |
| `ShiftTableTest/utils/sortStaffs.ts:18-21` | private | `const [h, m] = time.split(":").map(Number); return h * 60 + m;` |
| `ShiftDailyCardSP/MiniShiftBar.tsx:4-7` | private | `const [h, m] = time.split(":").map(Number); return h * 60 + m;` |
| `ShiftOverview/utils/calculations.ts:9-12` | exported | `const [hours, minutes] = time.split(":").map(Number); return hours * 60 + minutes;` |

→ ロジックは全て同一。変数名のみ異なる。

#### SortMenu — 2ファイルが100%同一コード

- `ShiftTableTest/SortMenu.tsx` (53行)
- `ShiftOverview/SortMenu.tsx` (53行)

import パスのみ異なり、JSX/ロジック/スタイリングは完全一致。

#### 状態管理ロジック — PC/SP で80%重複

**完全同一のコード（両方のindex.tsx）:**
```typescript
const [viewMode, setViewMode] = useState<ViewMode>("daily");
const { state: shifts, set: setShifts, undo, redo, canUndo, canRedo } = useUndoRedo(initialShifts);
const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
const [sortMode, setSortMode] = useState<SortMode>("default");
const sortedStaffs = useMemo(() => sortStaffs({ staffs, shifts, selectedDate, sortMode }), [...]);
const handleOverviewDateClick = useCallback((date: string) => { setSelectedDate(date); setViewMode("daily"); }, []);
```

**PC版のみの追加コード（12行）:**
```typescript
const undoHandler = useMemo(() => (!isReadOnly && viewMode === "daily" ? undo : () => {}), [...]);
const redoHandler = useMemo(() => (!isReadOnly && viewMode === "daily" ? redo : () => {}), [...]);
useKeyboardShortcuts({ onUndo: undoHandler, onRedo: redoHandler });
```

### 2.3 クロスコンポーネント依存関係

```
ShiftTableTest/types.ts （中核型定義）
  ├── ShiftViewSwitcher/types.ts → ShiftViewSwitcherBaseProps
  ├── ShiftViewSwitcherSP/index.tsx → SortMode
  ├── ShiftOverview/types.ts → re-export ShiftData, StaffType + 独自型
  ├── ShiftDailyCardSP/types.ts → PositionSegment, PositionType, ShiftData, SortMode, StaffType, TimeRange
  ├── ShiftOverviewCardSP/types.ts → PositionType, ShiftData, SortMode, StaffType, TimeRange
  └── ShiftOverview/SortMenu.tsx → SortMode

ShiftTableTest/hooks/useUndoRedo.ts
  ├── ShiftViewSwitcher/index.tsx
  └── ShiftViewSwitcherSP/index.tsx

ShiftTableTest/utils/sortStaffs.ts
  ├── ShiftViewSwitcher/index.tsx
  └── ShiftViewSwitcherSP/index.tsx

ShiftOverview/utils/dateUtils.ts
  ├── ShiftDailyCardSP/DateNavigator.tsx → isHoliday
  ├── ShiftOverviewCardSP/index.tsx → isHoliday
  └── ShiftOverviewCardSP/DateCard.tsx → isSaturday, isSunday

ShiftOverview/utils/calculations.ts
  ├── ShiftOverview/index.tsx → prepareStaffRowData
  └── ShiftOverviewCardSP/DateCard.tsx → getDailyShiftTime
```

### 2.4 型定義の全容

#### ShiftTableTest/types.ts (109行) — ドメイン型

| 型名 | 種別 | 用途 |
|------|------|------|
| `ShiftData` | type | シフトデータ（id, staffId, staffName, date, requestedTime, positions） |
| `PositionSegment` | type | ポジションセグメント（id, positionId, positionName, color, start, end） |
| `PositionType` | type | ポジション定義（id, name, color） |
| `StaffType` | type | スタッフ定義（id, name, isSubmitted） |
| `TimeRange` | type | 時間範囲（start, end, unit） |
| `DragMode` | type | ドラッグモード union |
| `ToolMode` | type | ツールモード union（"select" \| "assign" \| "erase"） |
| `SummaryDisplayMode` | type | サマリー表示モード（"color" \| "number"） |
| `SortMode` | type | ソートモード（"default" \| "request" \| "startTime"） |
| `FILL_RATE_COLORS` | const | 充足率6色配列 |
| `LinkedResizeTarget` | type | 連結リサイズ対象 |
| `ShiftTableTestProps` | type | ShiftTableTestコンポーネントProps（16プロパティ） |

定数（types.ts内に同居）:
- `TIME_AXIS_PADDING_PX = 30`
- `HOUR_WIDTH_PX = 120`
- `AUTO_SCROLL_EDGE_PX = 50`
- `AUTO_SCROLL_MIN_SPEED = 2`
- `AUTO_SCROLL_MAX_SPEED = 10`

#### ShiftOverview/types.ts (117行) — 俯瞰ビュー型

| 型名 | 種別 | 用途 |
|------|------|------|
| `RequiredStaffingData` | type | 必要人員データ |
| `ShiftOverviewProps` | type | ShiftOverviewコンポーネントProps |
| `StaffRowData` | type | スタッフ行表示データ |
| `DailyShift` | type | 1日のシフト情報 |
| `StaffAlert` | type | アラート情報 |
| `OverviewHeaderProps` | type | ヘッダーProps |
| `StaffRowProps` | type | スタッフ行Props |
| `MonthSummaryCellProps` | type | 月別合計セルProps |
| `SummaryFooterRowProps` | type | フッターProps |

#### ShiftOverview/constants.ts (9行) — 俯瞰ビュー定数

```
STAFF_NAME_CELL_WIDTH = 120
DATE_CELL_WIDTH = 90
MONTH_TOTAL_CELL_WIDTH = 60
ROW_HEIGHT = 48
WEEK_HOURS_LIMIT = 40 * 60 (分)
CONSECUTIVE_DAYS_LIMIT = 6 (日)
```

### 2.5 ユーティリティ関数の全容

#### shiftOperations.ts (564行) — 17 exported関数

| 関数 | シグネチャ | 用途 |
|------|----------|------|
| `timeToMinutes` | `(time: string) => number` | "10:30" → 630 |
| `minutesToTime` | `(totalMinutes: number) => string` | 630 → "10:30" |
| `pixelToMinutes` | `({ x, timeRange }) => number` | ピクセル→分変換 |
| `minutesToPixel` | `(minutes, timeRange) => number` | 分→ピクセル変換 |
| `getTimeAxisWidth` | `(timeRange) => number` | 時間軸の総幅（px） |
| `findShiftAtPosition` | `({ shifts, staffId, date, minutes }) => ShiftData \| null` | 位置にあるシフト検索 |
| `detectPositionResizeEdge` | `({ shifts, staffId, date, x, timeRange, threshold }) => {...} \| null` | リサイズ端検出 |
| `detectLinkedResizeEdge` | `(同上) => {...} \| null` | 連結リサイズ端検出 |
| `findPositionAtPosition` | `({ shifts, staffId, date, minutes }) => {...} \| null` | 位置にあるポジション検索 |
| `erasePosition` | `({ shift, startMinutes, endMinutes }) => ShiftData` | ドラッグ消去 |
| `resizePosition` | `({ shift, positionId, edge, newMinutes, minDuration }) => ShiftData` | 単体リサイズ |
| `resizeLinkedPositions` | `({ shift, linkedTarget, newMinutes, minDuration }) => ShiftData` | 連結リサイズ |
| `paintPosition` | `({ shift, positionId, ..., startMinutes, endMinutes, segmentId }) => ShiftData` | ポジション配置 |
| `mergeAdjacentPositions` | `(positions) => PositionSegment[]` | 隣接セグメントマージ |
| `fillGapsWithBreak` | `({ positions, breakPosition }) => PositionSegment[]` | 休憩自動挿入 |
| `normalizePositions` | `({ positions, breakPosition }) => PositionSegment[]` | 正規化パイプライン |
| `deletePositionFromShift` | `({ shift, positionSegmentId, breakPositionId }) => ShiftData` | セグメント個別削除 |

#### calculations.ts (143行) — 6 exported関数

| 関数 | シグネチャ | 用途 |
|------|----------|------|
| `timeToMinutes` | `(time: string) => number` | **重複** |
| `minutesToHoursLabel` | `(totalMinutes: number) => string` | 分→"8h"表示 |
| `calculateDailyMinutes` | `(shift: ShiftData) => number` | 1日の勤務分数（休憩除外） |
| `getDailyShiftTime` | `(shift: ShiftData) => DailyShift \| null` | 最早開始〜最遅終了 |
| `calculateMonthlyTotals` | `(shifts, staffId, months) => Map` | 月別合計 |
| `prepareStaffRowData` | `(staffs, shifts, allShifts, dates, months) => StaffRowData[]` | 行データ構築 |

#### dateUtils.ts (105行) — 10 exported関数

| 関数 | 用途 |
|------|------|
| `getDateRange` | 開始〜終了の日付配列生成 |
| `getMonthsInRange` | 期間内の月配列生成 |
| `isHoliday` | 祝日判定 |
| `getDayOfWeek` | 曜日取得 |
| `isSaturday` | 土曜判定 |
| `isSunday` | 日曜判定 |
| `formatDateShort` | "1/27" 形式 |
| `getWeekdayLabel` | "月" 形式 |
| `formatMonthLabel` | "1月計" 形式 |
| `getMonthKey` | "2026-01" 形式 |

#### sortStaffs.ts (100行) — 1 exported関数

| 関数 | シグネチャ | 用途 |
|------|----------|------|
| `sortStaffs` | `({ staffs, shifts, selectedDate, sortMode }) => StaffType[]` | 3モードソート |

内部にprivate `timeToMinutes` を持つ（**重複**）。

### 2.6 ShiftTableTest/index.tsx の責務分析（656行）

| 行範囲 | 責務 | 抽出先 |
|--------|------|--------|
| 1-30 | import文 | - |
| 31-55 | Props分割代入、StaffEditModal state | `pc/DailyView/index.tsx` |
| 56-84 | breakPositionの取得、setShiftsNormalized | `stores.ts`（atom write で自動化） |
| 87-102 | toolMode, selectedPositionId state | `stores.ts`（atom化） |
| 105-214 | ポップオーバー state + handlers | `pc/DailyView/index.tsx` or `stores.ts` |
| 217-245 | スクロールドラッグ state + handlers | `pc/DailyView/hooks/useScrollDrag.ts` |
| 248-269 | カーソル管理ロジック | ShiftGrid/StaffRow |
| 272-314 | document-level mouse listeners (drag continuation) | ShiftGrid/index.tsx |
| 319-392 | auto-scroll（requestAnimationFrame） | `pc/DailyView/hooks/useAutoScroll.ts` |
| 397-440 | テーブルヘッダー部分のJSX | ShiftGrid/index.tsx |
| 443-587 | staffs.map() — スタッフ行レンダリング | ShiftGrid/StaffRow.tsx |
| 588-635 | SummaryRow + ShiftPopover レンダリング | ShiftGrid/index.tsx |
| 640-653 | デバッグパネル（**削除対象**） | 削除 |

### 2.7 useDrag の現在のパラメータ（7つ）

```typescript
type UseDragParams = {
  shifts: ShiftData[];                    // → shiftsAtom から取得
  setShifts: (shifts: ShiftData[]) => void; // → shiftsAtom のsetter
  selectedPosition: PositionType | null;  // → selectedPositionAtom から取得
  toolMode: ToolMode;                     // → toolModeAtom から取得
  selectedDate: string;                   // → selectedDateAtom から取得
  timeRange: TimeRange;                   // props維持（shiftConfigAtom全体の購読を避けるため）
  getStaffName: (staffId: string) => string; // props維持
};
```

**useDrag 内の重複**: `handleMouseDown` 内で `detectLinkedResizeEdge` を3回（select/assign/erase 各モードで）ほぼ同一のコードで呼んでいる。→ 共通関数 `tryDetectResize` に抽出可能。

---

## 3. 新ディレクトリ構造

```
src/components/features/Shift/ShiftForm/
├── index.tsx                      # ShiftForm（トップレベル、Jotai Provider）
├── index.stories.tsx
├── types.ts                       # 全ドメイン型を統合
├── constants.ts                   # 全定数を統合
├── stores.ts                      # Jotai atoms（ShiftForm スコープ）
│
├── hooks/
│   ├── useShiftFormInit.ts        # props → atoms 初期化
│   └── useUndoRedo.ts             # atom ベースの undo/redo ラッパー
│
├── utils/
│   ├── timeConversion.ts          # timeToMinutes 等を統合（4箇所の重複解消）
│   ├── timeConversion.test.ts
│   ├── shiftOperations.ts         # paint/erase/resize/normalize（既存移行）
│   ├── shiftOperations.test.ts    # 既存テスト移行
│   ├── sortStaffs.ts              # ソートロジック（既存移行）
│   ├── sortStaffs.test.ts
│   ├── dateUtils.ts               # 日付ユーティリティ（ShiftOverview から移行）
│   └── calculations.ts            # 俯瞰計算（ShiftOverview から移行）
│
├── shared/                        # PC/SP共通UIコンポーネント
│   └── SortMenu/
│       ├── index.tsx              # 2つの重複 SortMenu を統合
│       └── index.stories.tsx
│
├── pc/                            # PC専用コンポーネント
│   ├── DailyView/
│   │   ├── index.tsx              # PC日毎ビュー（ShiftTableTest を分割）
│   │   ├── index.stories.tsx
│   │   ├── hooks/
│   │   │   ├── useDrag.ts         # ドラッグシステム（atoms読み取り）
│   │   │   ├── useAutoScroll.ts   # 自動スクロール（RAF ロジック抽出）
│   │   │   └── useScrollDrag.ts   # 選択モードの横スクロール
│   │   ├── ShiftGrid/
│   │   │   ├── index.tsx          # テーブル本体（StaffRowsのマッピング）
│   │   │   ├── StaffRow.tsx       # 1スタッフ行（ShiftTableTestから抽出）
│   │   │   ├── ShiftBar.tsx       # ポジションバー（既存移行）
│   │   │   ├── DragPreview.tsx    # ドラッグプレビュー（既存移行）
│   │   │   └── GridLines.tsx      # グリッド線（既存移行）
│   │   ├── PositionToolbar.tsx    # ツールバー（既存移行）
│   │   ├── DateTabs.tsx           # 日付タブ（既存移行）
│   │   ├── TimeHeader.tsx         # 時間ヘッダー（既存移行）
│   │   ├── ShiftPopover.tsx       # ポップオーバー（既存移行）
│   │   └── SummaryRow.tsx         # 充足度サマリー（既存移行）
│   └── OverviewView/
│       ├── index.tsx              # PC俯瞰ビュー（ShiftOverview から移行）
│       ├── index.stories.tsx
│       ├── OverviewHeader.tsx
│       ├── StaffRow.tsx
│       ├── MonthSummaryCell.tsx
│       └── SummaryFooterRow.tsx
│
└── sp/                            # SP専用コンポーネント
    ├── DailyView/
    │   ├── index.tsx              # SP日毎ビュー（ShiftDailyCardSP から移行）
    │   ├── index.stories.tsx
    │   ├── DateNavigator.tsx
    │   ├── StaffCard.tsx
    │   ├── MiniShiftBar.tsx
    │   ├── ShiftEditSheet.tsx
    │   ├── ShiftDetailSheet.tsx
    │   └── StaffAddSheet.tsx
    └── OverviewView/
        ├── index.tsx              # SP俯瞰ビュー（ShiftOverviewCardSP から移行）
        ├── index.stories.tsx
        └── DateCard.tsx
```

---

## 4. Jotai Atom 設計

### 4.1 スコーピング方式

ShiftForm で `<Provider>` を使用し、atoms をコンポーネントツリーにスコープ。
複数インスタンスが独立動作し、アンマウント時に自動リセット。

### 4.2 stores.ts の全 Atom 一覧

```typescript
import { atom } from "jotai";

// ==========================================
// 外部設定（propsから初期化、子コンポーネントは読み取り専用）
// ==========================================
export const shiftConfigAtom = atom<{
  shopId: string;
  staffs: StaffType[];
  positions: PositionType[];
  dates: string[];
  timeRange: TimeRange;
  holidays: string[];
  isReadOnly: boolean;
  currentStaffId?: string;
  allShifts?: ShiftData[];
  requiredStaffing?: RequiredStaffingData[];
}>({ /* defaults */ });

// ==========================================
// コア状態
// ==========================================
export const viewModeAtom = atom<"daily" | "overview">("daily");
export const selectedDateAtom = atom<string>("");
export const sortModeAtom = atom<SortMode>("default");

// ==========================================
// シフトデータ + Undo/Redo 履歴
// ==========================================
export const shiftsHistoryAtom = atom<{
  past: ShiftData[][];
  present: ShiftData[];
  future: ShiftData[][];
}>({ past: [], present: [], future: [] });

// 読み書きatom: 書き込み時に自動正規化 + 履歴追加
export const shiftsAtom = atom(
  (get) => get(shiftsHistoryAtom).present,
  (get, set, newShifts: ShiftData[]) => {
    const breakPos = get(breakPositionAtom);
    const normalized = breakPos
      ? newShifts.map(s => ({
          ...s,
          positions: normalizePositions({
            positions: s.positions,
            breakPosition: breakPos,
          }),
        }))
      : newShifts;
    const history = get(shiftsHistoryAtom);
    set(shiftsHistoryAtom, {
      past: [...history.past.slice(-49), history.present],
      present: normalized,
      future: [],
    });
  }
);

// Undo/Redo 状態
export const canUndoAtom = atom((get) => get(shiftsHistoryAtom).past.length > 0);
export const canRedoAtom = atom((get) => get(shiftsHistoryAtom).future.length > 0);

// Undo アクション (write-only atom)
export const undoAtom = atom(null, (get, set) => {
  const history = get(shiftsHistoryAtom);
  if (history.past.length === 0) return;
  set(shiftsHistoryAtom, {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  });
});

// Redo アクション (write-only atom)
export const redoAtom = atom(null, (get, set) => {
  const history = get(shiftsHistoryAtom);
  if (history.future.length === 0) return;
  set(shiftsHistoryAtom, {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  });
});

// ==========================================
// PC日毎ビュー専用
// ==========================================
export const toolModeAtom = atom<ToolMode>("select");
export const selectedPositionIdAtom = atom<string | null>(null);
export const summaryExpandedAtom = atom<boolean>(false);
export const summaryDisplayModeAtom = atom<SummaryDisplayMode>("color");

// ==========================================
// 派生atom
// ==========================================
export const sortedStaffsAtom = atom((get) => {
  const config = get(shiftConfigAtom);
  const shifts = get(shiftsAtom);
  const selectedDate = get(selectedDateAtom);
  const sortMode = get(sortModeAtom);
  return sortStaffs({ staffs: config.staffs, shifts, selectedDate, sortMode });
});

export const selectedPositionAtom = atom((get) => {
  const config = get(shiftConfigAtom);
  const id = get(selectedPositionIdAtom);
  return id ? config.positions.find(p => p.id === id) ?? null : null;
});

export const breakPositionAtom = atom((get) => {
  return get(shiftConfigAtom).positions.find(p => p.name === "休憩") ?? null;
});
```

### 4.3 Props → Atoms の分離

| データ | 管理方式 | 理由 |
|--------|---------|------|
| shopId, staffs, positions, dates, timeRange, holidays, isReadOnly, currentStaffId, allShifts, requiredStaffing | `shiftConfigAtom`（propsから初期化） | 外部からの読み取り専用データ |
| shifts + undo/redo 履歴 | `shiftsHistoryAtom` + `shiftsAtom` | ユーザー操作で頻繁に変更 |
| viewMode, selectedDate, sortMode | 個別atom | UI状態 |
| toolMode, selectedPositionId, summary* | 個別atom | PC日毎ビュー専用UI状態 |

### 4.4 Props Drilling の解消効果

**Before（ShiftViewSwitcher → ShiftTableTest、16個のprops）:**
```
shopId, staffs, positions, shifts, onShiftsChange, dates, timeRange,
selectedDate, onDateChange, onUndo, onRedo, canUndo, canRedo,
sortMode, onSortModeChange, isReadOnly, currentStaffId
```

**After（pc/DailyView、0個のprops drilling）:**
```
// 全て atom から取得
const shifts = useAtomValue(shiftsAtom);
const config = useAtomValue(shiftConfigAtom);
const selectedDate = useAtomValue(selectedDateAtom);
// etc.
```

ShiftBar, GridLines 等の末端UIコンポーネントは引き続き直接の親から focused props を受け取る（これは適切）。

---

## 5. useDrag の Atom 化

**Before（7パラメータ）:**
```typescript
{ shifts, setShifts, selectedPosition, toolMode, selectedDate, timeRange, getStaffName }
```

**After（0パラメータ、全て atom から取得）:**
```typescript
// useDrag 内部で atom を直接購読
const shifts = useAtomValue(shiftsAtom);
const setShifts = useSetAtom(shiftsAtom);
const selectedPosition = useAtomValue(selectedPositionAtom);
const toolMode = useAtomValue(toolModeAtom);
const selectedDate = useAtomValue(selectedDateAtom);
const config = useAtomValue(shiftConfigAtom);
// timeRange は config.timeRange
// getStaffName は config.staffs から導出
```

※ `shiftConfigAtom` の全体購読による再レンダリングが問題になる場合は `selectAtom` で必要なフィールドのみ取得する。

**追加改善**: handleMouseDown 内の3回の `detectLinkedResizeEdge` 呼び出しを `tryDetectResize()` に共通化。

---

## 6. コンポーネント階層

```
<Provider>                              ← Jotai スコープ
  <ShiftForm>                           ← 初期化 (useShiftFormInit)
    │
    ├── [SP: display={{ base: "block", lg: "none" }}]
    │   └── SPHeader (undo/redo buttons + SegmentGroup)
    │
    ├── [PC: display={{ base: "none", lg: "block" }}]
    │   └── PCHeader (SegmentGroup only)
    │
    ├── [daily, display:none切替]
    │   ├── [PC] pc/DailyView
    │   │   ├── PositionToolbar (undo/redo/tool/position, atom読み取り)
    │   │   ├── DateTabs
    │   │   ├── ShiftGrid
    │   │   │   ├── TimeHeader
    │   │   │   ├── StaffRow × N
    │   │   │   │   ├── GridLines
    │   │   │   │   ├── ShiftBar
    │   │   │   │   └── DragPreview
    │   │   │   └── SummaryRow
    │   │   └── ShiftPopover
    │   │
    │   └── [SP] sp/DailyView
    │       ├── DateNavigator
    │       ├── FulfillmentBar
    │       ├── StaffCard × N
    │       │   └── MiniShiftBar
    │       ├── ShiftEditSheet / ShiftDetailSheet
    │       └── StaffAddSheet
    │
    └── [overview, display:none切替]
        ├── [PC] pc/OverviewView
        │   ├── OverviewHeader
        │   ├── StaffRow × N
        │   │   └── MonthSummaryCell
        │   └── SummaryFooterRow
        │
        └── [SP] sp/OverviewView
            ├── shared/SortMenu
            ├── DateCard × N
            ├── ShiftEditSheet（sp/DailyView から import）
            └── StaffAddSheet（sp/DailyView から import）
```

PC/SP分岐は Chakra UI の `display={{ base: "none", lg: "block" }}` で実現。

---

## 7. 追加リファクタ観点

| # | 観点 | 詳細 | 優先度 |
|---|------|------|--------|
| 1 | ShiftTableTest の "Test" 命名 | → `pc/DailyView` に改名 | 高 |
| 2 | 自動正規化の一元化 | `shiftsAtom` の write に組み込み、どこから更新しても正規化が保証 | 高 |
| 3 | useDrag内のリサイズ判定重複 | 3つの toolMode 分岐で `detectLinkedResizeEdge` を同パターンで呼出 → `tryDetectResize()` に抽出 | 中 |
| 4 | ShiftEditSheet (262行) | ポジション追加ロジックとUIを分離可能（hooks化） | 低 |
| 5 | デバッグパネル | ShiftTableTest 640-653行 → 削除 | 高 |
| 6 | constants の分散 | types.ts内の定数（HOUR_WIDTH_PX等）とconstants.tsの定数を統合 | 高 |

---

## 8. 実装フェーズ

### Phase 1: 基盤（既存に影響なし）

| # | タスク | 作成ファイル | 詳細 |
|---|--------|-------------|------|
| 1 | 型定義統合 | `ShiftForm/types.ts` | ShiftTableTest/types.ts のドメイン型 + ShiftOverview/types.ts のドメイン型（RequiredStaffingData, StaffRowData, DailyShift, StaffAlert）を統合。Props型は各コンポーネントにコロケーション |
| 2 | 定数統合 | `ShiftForm/constants.ts` | ShiftTableTest/types.ts内の定数 + ShiftTableTest/constants.ts + ShiftOverview/constants.ts + FILL_RATE_COLORS を統合 |
| 3 | 時間変換統合 | `ShiftForm/utils/timeConversion.ts` + `.test.ts` | 4箇所の `timeToMinutes` + `minutesToTime` + `pixelToMinutes` + `minutesToPixel` + `getTimeAxisWidth` + `minutesToHoursLabel` を統合 |
| 4 | utils移行 | `ShiftForm/utils/shiftOperations.ts` + `.test.ts` | 既存移行、import先を timeConversion に変更 |
| 5 | utils移行 | `ShiftForm/utils/sortStaffs.ts` | 既存移行、private timeToMinutes を削除して timeConversion からimport |
| 6 | utils移行 | `ShiftForm/utils/dateUtils.ts` | ShiftOverview/utils/dateUtils.ts を移行 |
| 7 | utils移行 | `ShiftForm/utils/calculations.ts` | ShiftOverview/utils/calculations.ts を移行、重複 timeToMinutes を削除 |
| 8 | Atom定義 | `ShiftForm/stores.ts` | 全atoms定義（上記§4.2参照） |
| 9 | Hooks | `ShiftForm/hooks/useShiftFormInit.ts` | props → atoms 初期化hook |
| 10 | Hooks | `ShiftForm/hooks/useUndoRedo.ts` | atom ベースの undo/redo ラッパー（後方互換） |
| 11 | 共通UI | `ShiftForm/shared/SortMenu/` | 2つの重複SortMenu を統合、atom から sortMode を読み取り |

### Phase 2: コンポーネント構築（既存に影響なし）

| # | タスク | 作成ファイル | 詳細 |
|---|--------|-------------|------|
| 12 | トップレベル | `ShiftForm/index.tsx` | Provider + useShiftFormInit + PC/SP分岐（display切替） |
| 13 | PC日毎ビュー | `ShiftForm/pc/DailyView/` | ShiftTableTest を分割移行（index.tsx ~120行 + hooks + ShiftGrid） |
| 14 | PC日毎: Grid | `ShiftForm/pc/DailyView/ShiftGrid/` | テーブル本体 + StaffRow + ShiftBar + DragPreview + GridLines |
| 15 | PC日毎: Hooks | `ShiftForm/pc/DailyView/hooks/` | useDrag（atom化）+ useAutoScroll + useScrollDrag |
| 16 | PC日毎: UI | PositionToolbar, DateTabs, TimeHeader, ShiftPopover, SummaryRow | 既存移行（import先変更） |
| 17 | PC俯瞰ビュー | `ShiftForm/pc/OverviewView/` | ShiftOverview を移行 |
| 18 | SP日毎ビュー | `ShiftForm/sp/DailyView/` | ShiftDailyCardSP を移行（MiniShiftBar の private timeToMinutes 削除） |
| 19 | SP俯瞰ビュー | `ShiftForm/sp/OverviewView/` | ShiftOverviewCardSP を移行 |
| 20 | Storybook | `ShiftForm/index.stories.tsx` | 既存mock dataを利用して作成 |

### Phase 3: 切替 + クリーンアップ

| # | タスク | 詳細 |
|---|--------|------|
| 21 | 消費元切替 | pages層の消費元を ShiftForm に切替（現在storiesのみなのでリスク低） |
| 22 | 旧ディレクトリ削除 | ShiftViewSwitcher, ShiftViewSwitcherSP, ShiftTableTest, ShiftOverview, ShiftDailyCardSP, ShiftOverviewCardSP |
| 23 | import パス更新 | grep で旧パスを検索し全更新 |

### Phase 4: 検証

| # | タスク | コマンド |
|---|--------|---------|
| 24 | 型チェック | `pnpm type-check` |
| 25 | リント & フォーマット | `pnpm lint && pnpm format` |
| 26 | テスト | `pnpm test` |
| 27 | Storybook目視確認 | `pnpm storybook` で全パターン確認 |

---

## 9. 現在の進捗

- [x] 調査・分析完了
- [ ] Phase 1: 基盤（タスク1-11）
- [ ] Phase 2: コンポーネント構築（タスク12-20）
- [ ] Phase 3: 切替 + クリーンアップ（タスク21-23）
- [ ] Phase 4: 検証（タスク24-27）


## 参考
@doc/spec/2026-02-08シフト編集機能仕様.md
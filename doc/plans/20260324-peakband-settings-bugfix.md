# PeakBandSettings 不具合修正プラン

## 背景

2026-03-24 に必要人員設定画面（PeakBandSettings）の探索的テストを実施し、4件の不具合を発見。

---

## 不具合一覧

### 1. [高] 必要人数0でフロントバリデーションなし → サーバー500エラー

**再現手順**: かんたんモード → 必要人数を0に変更 → 保存 → 500エラー

**原因**:
- フロント: `<Input min={1}>` のHTML属性のみで、直接入力で0を受け入れ可能。`handleBandChange`（行154-162）に値の範囲チェックなし
- バックエンド: `convex/requiredStaffing/mutations.ts` の `upsertPeakBands`（行130-179）で `requiredCount: v.number()` に最小値制約なし

**修正方針**:
- フロント: `handleBandChange` で `requiredCount` が1未満の場合は1にクランプ
- バックエンド: `upsertPeakBands` の引数バリデーションで `requiredCount >= 1` を検証し、違反時はエラーメッセージを返す

**関連ファイル**:
- `src/components/features/Shift/PeakBandSettings/index.tsx` (行154-162, 390-401, 440-456)
- `convex/requiredStaffing/mutations.ts` (行130-179)

---

### 2. [中] 開始時間 > 終了時間でバリデーションなし

**再現手順**: かんたんモード → 開始時間を18:00、終了時間を10:00に設定 → 保存 → エラー表示なし

**原因**:
- フロント: `handleBandChange`（行154-162）に時間の前後関係チェックなし
- `handleSave`（行171-183）でもピーク帯の時間バリデーションなし
- バックエンド: `startTime` / `endTime` を文字列として受け取り、順序チェックなし

**修正方針**:
- フロント: `handleSave` 時に `startTime < endTime` を検証し、違反時はエラーメッセージ（トースト or インラインエラー）を表示
- バックエンド: `upsertPeakBands` で `startTime < endTime` を検証

**関連ファイル**:
- `src/components/features/Shift/PeakBandSettings/index.tsx` (行154-162, 171-183)
- `convex/requiredStaffing/mutations.ts` (行130-179)

---

### 3. [低] 保存成功のフィードバックがない

**再現手順**: 任意の値を設定 → 保存 → 画面に何も変化なし

**原因**:
- `StaffingSettingsPage`（行55-58）にトースト表示コードはあるが、`PeakBandSettings` の `handleSave`（行171-183）が `onSave` の完了を正しく伝搬していない可能性
- 保存ボタンのグレーアウトのみで成功を暗示しているが、ユーザーには判別困難

**修正方針**:
- `StaffingSettingsPage` の `onSave` コールバック内のトースト表示が正しく発火するかデバッグ
- 必要に応じて `PeakBandSettings` 側で `onSave` の戻り値を確認し、成功/失敗をハンドリング

**関連ファイル**:
- `src/components/pages/Shops/StaffingSettingsPage/index.tsx` (行36-71)
- `src/components/features/Shift/PeakBandSettings/index.tsx` (行171-183)

---

### 4. [低] 詳細モードで保存後、編集中のタブから月曜タブに戻される

**再現手順**: 詳細モード → 水曜タブ → ピーク帯削除 → 保存 → 月曜タブに遷移

**原因**:
- 保存後、Convexの `staffingData` クエリが自動更新 → `initialData`（`StaffingSettingsPage` 行25-33）が再計算 → PeakBandSettings の props が変わりコンポーネントが再マウント → `useState(1)` で `selectedDay` が月曜にリセット（行98）

**修正方針**:
- PeakBandSettings に `key` prop を使わず、`initialData` の変更時に `selectedDay` をリセットしないようにする
- 方法A: `selectedDay` を `useRef` + 外部管理にする
- 方法B: `useEffect` で `initialData` 変更時に `daySettingsMap` のみ更新し、`selectedDay` は維持する
- 方法C: 親コンポーネントで `selectedDay` を管理して props として渡す

**関連ファイル**:
- `src/components/features/Shift/PeakBandSettings/index.tsx` (行98, 100-102)
- `src/components/pages/Shops/StaffingSettingsPage/index.tsx` (行25-33)

---

### 5. [中] 詳細→かんたんモード切替時に daySettingsMap がリセットされない

**再現手順**: 詳細モードで曜日ごとに異なる設定 → かんたんモードに切替（確認ダイアログで「切り替える」） → daySettingsMap に詳細モード時の値が残っている

**原因**:
- `handleConfirmModeSwitch`（行201-205）で `setMode("simple")` と `setSelectedGroup("weekday")` のみ実行し、`daySettingsMap` をリセットしていない

**修正方針**:
- `handleConfirmModeSwitch` で `daySettingsMap` をかんたんモードの初期状態（平日/休日の2パターン）にリセットする
- 確認ダイアログで同意した時点でデータがリセットされるのが、ダイアログの警告文言「上書きされます」と整合する正しい挙動

**関連ファイル**:
- `src/components/features/Shift/PeakBandSettings/index.tsx` (行201-205)

---

## 修正優先順位

1. 不具合1（必要人数0 → 500エラー） — ユーザー操作でサーバーエラーが発生するため最優先
2. 不具合2（時間帯逆転） — 不正データが保存される可能性
3. 不具合5（モード切替時のデータリセット漏れ） — 確認ダイアログの意味がなくなる
4. 不具合3（保存フィードバック） — UX改善
5. 不具合4（タブリセット） — UX改善

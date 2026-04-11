# SetupModal リファクタ: 初回UX導線の改善

## 背景・課題

初回ユーザーがダッシュボードに来たとき:
- 店舗もスタッフも未登録の状態でUIが表示され、何をすべかわからない
- スタッフ追加ボタンが押せてしまい `ConvexError: Not found` になる
- SetupModal が自動で開かない
- 現在のSetupは「店舗作成 → 募集作成」だが、スタッフ未登録で募集しても意味がない
- `staffs` と `users` の紐付けがなく、管理者がどのスタッフかを判定できない

## 方針

**SetupModal を「店舗情報(STEP1) → あなたの情報(STEP2)」の強制2ステップに変更。**
**スキーマに `staffs.userId` を追加し、管理者 = スタッフの紐付けを実現。**
**初回セットアップを1トランザクションで実行する専用 mutation を作成。**

### デザイン（確定済み: `design/dashboard.pen`）

| フレーム | Stepper | タイトル | 内容 |
|---------|---------|---------|------|
| Step1 | ❶ 店舗情報 → ② あなたの情報 | 店舗情報を登録 | 店舗名 + シフト開始/終了時間 |
| Step2 | ✓ 店舗情報 → ❷ あなたの情報 | あなたの情報を登録 | あなたの名前 + メールアドレス |

- ヘルプテキスト: 「ほかのスタッフはセットアップ完了後にいつでも追加・編集できます」
- CloseButton なし（閉じれない強制モーダル）

### 状態遷移

| ダッシュボード表示時 | 動作 |
|------|------|
| `shop === null` | 強制SetupModal（STEP1→STEP2、閉じれない） |
| `shop !== null` | 通常ダッシュボード |

---

## 実装ステップ

### 1. スキーマ変更: `staffs` に `userId` を追加

**対象ファイル:** `convex/schema.ts`

```typescript
staffs: defineTable({
  shopId: v.id("shops"),
  name: v.string(),
  email: v.string(),
  userId: v.optional(v.id("users")),  // ← 追加: 管理者の場合のみセット
  isDeleted: v.boolean(),
})
```

- `v.optional` — 通常スタッフは `undefined`、管理者のみ `Id<"users">` がセットされる
- インデックス追加不要（userId で検索するユースケースは当面ない）

### 2. 初回セットアップ専用 mutation 作成

**新規ファイル:** `convex/setup/mutations.ts`（既存の `createShop` を置き換え）

#### `setupShopAndOwner` (authenticatedMutation)

1トランザクションで以下を実行:

```
args: {
  shopName, shiftStartTime, shiftEndTime,  // Step1 データ
  ownerName, ownerEmail,                    // Step2 データ
}

handler:
  1. shops テーブルに店舗作成 → shopId
  2. users テーブルに管理者作成（clerkId = identity.subject）→ userId
  3. staffs テーブルに管理者スタッフ作成（shopId, name, email, userId）
  4. return shopId
```

- 既存の `createShop` は削除（`setupShopAndOwner` に統合）
- 既に店舗がある場合は `ConvexError` を throw

#### Zod スキーマ

**対象ファイル:** `convex/setup/schemas.ts`

```typescript
// 既存の createShopSchema はそのまま（Step1 用）

// Step2 用を追加
export const ownerProfileSchema = z.object({
  name: z.string().min(1, "名前を入力してください"),
  email: z.string().min(1, "メールアドレスを入力してください").email("正しいメールアドレスを入力してください"),
});

// 統合スキーマ（mutation 引数用）
export const setupShopSchema = createShopSchema.and(ownerProfileSchema.transform((d) => ({
  ownerName: d.name,
  ownerEmail: d.email,
})));
```

### 3. SetupStep2 を「あなたの情報」フォームに差し替え

**対象ファイル:** `src/components/features/Dashboard/SetupModal/SetupStep2/index.tsx`

- フォームフィールド: `name`（あなたの名前）+ `email`（メールアドレス）
- フォームID: `"setup-step2"`（変更なし）
- スキーマ: `ownerProfileSchema` を使用
- ヘルプテキスト: 「ほかのスタッフはセットアップ完了後にいつでも追加・編集できます」
- `Step2Data` 型: `{ name: string; email: string }`

### 4. SetupModal のラベル・制御を更新

**対象ファイル:** `src/components/features/Dashboard/SetupModal/index.tsx`

- `SetupData` 型: `Step1Data & Step2Data` → `CreateShopInput & { name: string; email: string }`
- Stepper ラベル: 「シフト募集作成」→「あなたの情報」
- タイトル: Step2 時「シフト募集を作成」→「あなたの情報を登録」
- `ChakraDialog.CloseTrigger` を削除
- `closeOnInteractOutside={false}` を追加
- `handleOpenChange` で close を無視

### 5. DashboardContent の変更

**対象ファイル:** `src/components/features/Dashboard/DashboardContent/index.tsx`

- `shop === null` のとき SetupModal を自動で開く
- `handleSetupComplete`:
  - `setupShopAndOwner({ shopName, shiftStartTime, shiftEndTime, ownerName, ownerEmail })` を1回呼ぶだけ
  - `createShop` + `addStaffs` の逐次呼び出しを削除
- 募集作成ボタン: 常に `recruitmentModal.open`（分岐削除）
- `onSetupClick` を RecruitmentSection から削除
- `useMutation(api.setup.mutations.createShop)` → `useMutation(api.setup.mutations.setupShopAndOwner)` に変更

### 6. RecruitmentSection の変更

**対象ファイル:** `src/components/features/Dashboard/RecruitmentSection/index.tsx`

- `onSetupClick` prop を削除
- 空状態の「はじめる」ボタンを削除

### 7. テスト更新

**対象ファイル:**
- `convex/setup/mutations.test.ts` — `createShop` テストを `setupShopAndOwner` に差し替え
  - 店舗 + users + staffs が1トランザクションで作成されること
  - staffs.userId が users._id と一致すること
  - 既存店舗がある場合のエラー

### 8. Stories 更新

**対象ファイル:**
- `src/components/features/Dashboard/DashboardContent/index.stories.tsx`
- `src/components/features/Dashboard/SetupModal/index.stories.tsx`
- `src/components/features/Dashboard/RecruitmentSection/index.stories.tsx`

---

## 参考ファイル

- `src/components/features/Dashboard/SetupModal/index.tsx` — SetupModal 本体
- `src/components/features/Dashboard/SetupModal/SetupStep1/index.tsx` — STEP1（変更なし）
- `src/components/features/Dashboard/SetupModal/SetupStep2/index.tsx` — STEP2（差し替え対象）
- `src/components/features/Dashboard/DashboardContent/index.tsx` — メインオーケストレーター
- `src/components/features/Dashboard/RecruitmentSection/index.tsx` — onSetupClick 削除
- `convex/schema.ts` — staffs テーブルにuserId 追加
- `convex/setup/schemas.ts` — createShopSchema + ownerProfileSchema
- `convex/setup/mutations.ts` — setupShopAndOwner mutation
- `convex/_lib/functions.ts` — authenticatedMutation（setupShopAndOwner で使用）
- `design/dashboard.pen` — デザインファイル（修正済み）

## 議論で出た懸念点・注意事項

- `setupShopAndOwner` は1トランザクション。途中失敗は自動ロールバック
- `staffs.userId` は `v.optional` — 通常スタッフは undefined、管理者のみセット
- 管理者 = シフトに入る前提。`staffs` テーブルに登録される
- 店舗情報の編集（Update）は今回のスコープ外
- 既存の `createShop` mutation は `setupShopAndOwner` に置き換え。他から `createShop` を呼んでいる箇所がないか確認
- `addStaffs` mutation は通常のスタッフ追加で引き続き使用（変更なし、userId は渡さない）

## 検証

1. `pnpm type-check` / `pnpm lint` / `pnpm test`
2. `pnpm convex:dev` でデプロイ成功
3. ブラウザ確認:
   - 初回ログイン → 強制SetupModal表示（閉じれない）
   - Step1入力 → Step2入力 → 「登録する」→ ダッシュボード表示
   - Convex Dashboard で shops / users / staffs にレコード作成確認
   - staffs.userId が users._id と一致
   - 「新しい募集を作成」ボタンで通常の募集作成モーダル表示
   - 「スタッフを追加」ボタンで通常のスタッフ追加モーダル表示

# Convex アーキテクチャ規約

## 設計方針

**Use-Case Slices + CQRS** — ユースケース（画面/機能）単位でディレクトリを分割し、読み取り（queries）と書き込み（mutations）を分離する。

## ディレクトリ構造

```
convex/
├── {useCase}/              # ユースケース単位のディレクトリ
│   ├── schemas.ts          # Zodバリデーションスキーマ（フロント共有）
│   ├── queries.ts          # 読み取り（query）
│   ├── mutations.ts        # 書き込み（mutation）
│   └── actions.ts          # 外部API呼び出し（internalAction）
│
├── _lib/                   # 共通ユーティリティ
│   ├── validation.ts       # 共通Zodリファインメント（optionalEmail等）
│   └── time.ts             # 時刻ユーティリティ
├── constants.ts            # グローバル定数・型定義
├── schema.ts               # DBスキーマ
├── auth.config.ts          # Clerk認証設定
└── _generated/             # 自動生成（編集禁止）
```

## ファイル配置ルール

| コードの種類 | 配置先 |
|------------|--------|
| mutation引数のZodスキーマ | そのユースケースの `schemas.ts` |
| 特定画面/機能のAPI | そのユースケースの `queries.ts` / `mutations.ts` |
| 外部APIを呼ぶ処理 | そのユースケースの `actions.ts`（`internalAction`） |
| 共通バリデーションヘルパー | `_lib/validation.ts` |
| 複数ユースケースの共通処理 | `_lib/` |
| 定数・型定義 | `constants.ts` |

**判断基準**: 「この API は誰が、どの画面で使うか？」で決める。DBテーブルではなくユースケースに紐付ける。

## Convex 固有の注意事項

- `_` プレフィクスのディレクトリ（`_lib/` 等）はConvexがAPIとして公開しない
- `_generated/` は Convex CLI が自動生成するため手動編集禁止
- `actions.ts` は `internalAction` で定義し、`mutations` から `ctx.scheduler` 経由で呼び出す
- queries のエラーは `null` or `{ error }` を返す（throwしない）。mutations のエラーは `ConvexError` をthrow
- 論理削除は `isDeleted` フラグを使用。クエリでは常にフィルタリングする

## セキュリティ

### 大前提：Convex はパブリック API

mutation / query はクライアントから直接呼べる。**関数名が分かれば誰でも叩ける**前提で全関数を設計する。

### 認証ラッパー（必須）

`convex-helpers` の `customMutation` / `customQuery` でラッパーを作り、**生の `mutation` / `query` を直接使わない**。

```ts
// convex/_lib/functions.ts
export const managerMutation = customMutation(mutation, {
  args: {},
  input: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "manager") throw new Error("Forbidden");
    return { ctx: { user }, args: {} };
  },
});

export const staffMutation = customMutation(mutation, {
  args: { token: v.string() },
  input: async (ctx, args) => {
    const staff = await verifyMagicLinkToken(ctx, args.token);
    if (!staff) throw new Error("Invalid or expired token");
    return { ctx: { staff }, args: {} };
  },
});
// managerQuery, staffQuery も同様に作成
```

Biome / ESLint で `_generated/server` からの生 `mutation` / `query` インポートを禁止する。

### IDOR 対策

クライアントから渡される ID は信頼しない。取得後に所属を必ず検証する。

```ts
// ❌ ID をそのまま信頼
const recruitment = await ctx.db.get(args.recruitmentId);

// ✅ 取得後に所属を検証
const recruitment = await ctx.db.get(args.recruitmentId);
if (!recruitment || recruitment.shopId !== ctx.user.shopId) {
  throw new Error("Not found");
}
```

### 列挙攻撃対策

「Not found」と「Forbidden」を区別しない。同一エラーを返す。

```ts
// ❌ 情報が漏れる
if (!recruitment) throw new Error("Not found");
if (recruitment.shopId !== shopId) throw new Error("Forbidden");

// ✅ 区別しない
if (!recruitment || recruitment.shopId !== shopId) {
  throw new Error("Not found");
}
```

### 過剰なデータ露出の防止

query の返り値はドキュメントをそのまま返さず、必要なフィールドだけに絞る。

- スタッフ向け API でマネージャーのメールアドレスを返さない
- スタッフ同士のメールアドレスも返さない（名前のみ）
- シフト希望の詳細は本人 + マネージャーのみ

### Magic Link セキュリティ

| 項目 | 対策 |
|------|------|
| トークン | UUID v4（128bit エントロピー） |
| 有効期限 | 72 時間 |
| 使用回数 | ワンタイム（使用後に `usedAt` を記録し無効化） |
| ブルートフォース | レートリミット必須（`convex-helpers` Rate Limiter） |
| URL 漏洩 | `rel="noreferrer"` でリファラー漏洩を防止 |

### 入力バリデーション

- 全 mutation の `args` に `v.` バリデータを必ず定義
- 文字列の最大長、配列の最大件数などビジネスロジック制約も加える
- 必要に応じて `withZod` で高度なバリデーションを追加

## スキーマ共有ルール

- mutation に渡すデータの Zod スキーマは `{useCase}/schemas.ts` に定義する
- フロントエンドは `@/convex/{useCase}/schemas` でインポートし、zodResolver に渡す
- フォーム固有のバリデーション（配列ラッパー、UI表示用refinement）は `src/` 側で schemas を compose する
- `schemas.ts` は純粋な Zod 定義のみ。DB アクセスや Convex API のインポート禁止
- 型は `z.infer<typeof schema>` で導出し、手動で型定義しない

### レートリミット

`convex-helpers` の Rate Limiter を使用。特に以下に適用必須：

- Magic Link トークン検証
- シフト希望提出

### 実装チェックリスト

- [ ] `convex-helpers` をインストール
- [ ] `managerMutation` / `managerQuery` ラッパーを作成
- [ ] `staffMutation` / `staffQuery` ラッパーを作成
- [ ] 生の `mutation` / `query` インポートをリンターで禁止
- [ ] 全 public 関数で shop 所属チェックを実装
- [ ] query の返り値を必要最低限のフィールドに制限
- [ ] Magic Link のワンタイム・有効期限を実装
- [ ] エラーメッセージから内部情報が漏れないことを確認
- [x] レートリミットを Magic Link 検証に適用

## テスト

### 方針

`convex-test` + Vitest でユニットテスト。100%カバレッジは目指さず、セキュリティとコアロジックを優先する。

実行: `pnpm test:convex` / `pnpm test:convex:once`

### ファイル配置

コロケーション。テスト共通ユーティリティは `_test/` に配置。
```
convex/
├── {useCase}/
│   ├── queries.ts
│   ├── queries.test.ts
│   ├── mutations.ts
│   └── mutations.test.ts
├── _test/
│   └── setup.ts
```

### テスト優先度（高→低）

1. **認証・認可** — ラッパーが未認証・権限不足を弾くこと
2. **IDOR** — shopId 不一致で "Not found" になること
3. **Magic Link** — 期限切れ・使用済みトークンの拒否
4. **コアビジネスロジック** — シフト生成、希望提出等
5. **query 返り値制限** — 不要フィールドが漏れないこと
6. **エッジケース** — 論理削除済みのフィルタ、空データ時の挙動

### ルール

- 各テストは独立した `convexTest` インスタンスを使う（テスト間でデータ共有しない）
- 認証テストは `t.withIdentity()` を使う
- 正常系と異常系をセットで書く
- テストデータは internal mutation 経由でセットアップ

### テスト不要

- `_generated/`
- 追加ロジックのない単純 CRUD
- schema 定義

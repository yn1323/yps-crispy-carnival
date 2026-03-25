# Convex アーキテクチャ規約

## 設計方針

**Use-Case Slices + CQRS** — ユースケース（画面/機能）単位でディレクトリを分割し、読み取り（queries）と書き込み（mutations）を分離する。

## ディレクトリ構造

```
convex/
├── {useCase}/              # ユースケース単位のディレクトリ
│   ├── queries.ts          # 読み取り（query）
│   ├── mutations.ts        # 書き込み（mutation）
│   └── actions.ts          # 外部API呼び出し（internalAction）
│
├── _lib/                   # 共通ユーティリティ
├── constants.ts            # グローバル定数・型定義
├── schema.ts               # DBスキーマ
├── auth.config.ts          # Clerk認証設定
└── _generated/             # 自動生成（編集禁止）
```

## ファイル配置ルール

| コードの種類 | 配置先 |
|------------|--------|
| 特定画面/機能のAPI | そのユースケースの `queries.ts` / `mutations.ts` |
| 外部APIを呼ぶ処理 | そのユースケースの `actions.ts`（`internalAction`） |
| 複数ユースケースの共通処理 | `_lib/` |
| 定数・型定義 | `constants.ts` |

**判断基準**: 「この API は誰が、どの画面で使うか？」で決める。DBテーブルではなくユースケースに紐付ける。

## Convex 固有の注意事項

- `_` プレフィクスのディレクトリ（`_lib/` 等）はConvexがAPIとして公開しない
- `_generated/` は Convex CLI が自動生成するため手動編集禁止
- `actions.ts` は `internalAction` で定義し、`mutations` から `ctx.scheduler` 経由で呼び出す
- queries のエラーは `null` or `{ error }` を返す（throwしない）。mutations のエラーは `ConvexError` をthrow
- 論理削除は `isDeleted` フラグを使用。クエリでは常にフィルタリングする

# Convex アーキテクチャ設計方針

## 設計名
**Feature Slices + CQRS + Policy Pattern**

## ディレクトリ構造

```
convex/
├── shop/                    # ドメイン単位でディレクトリ
│   ├── queries.ts           # 読み取り操作
│   ├── mutations.ts         # 書き込み操作
│   └── policies.ts          # ロール判定ロジック
│
├── user/
│   ├── queries.ts
│   ├── mutations.ts
│   └── policies.ts
│
├── invite/
│   ├── queries.ts
│   ├── mutations.ts
│   └── policies.ts
│
├── helpers.ts               # 全ドメイン共通ヘルパー
├── constants.ts             # 全ドメイン共通定数
└── schema.ts                # DBスキーマ
```

## 各ファイルの責務

| ファイル | 責務 | 特徴 |
|----------|------|------|
| **queries.ts** | データ取得 | 副作用なし、policiesで表示フィルタリング |
| **mutations.ts** | データ変更 | 副作用あり、policiesで操作可否判定 |
| **policies.ts** | 権限判定 | 純粋関数、テスト容易、ドメイン知識集約 |
| **helpers.ts** | DB操作共通処理 | `getUserByAuthId`, `requireShop`等 |

## policies.tsの設計原則

```ts
// ✅ 純粋関数（DBアクセスなし）
export const canResignUser = (
  executorRole: ShopUserRoleType | null,
  targetRole: ShopUserRoleType,
) => {
  if (!executorRole) return false;
  if (targetRole === "owner") return false;
  if (executorRole === "manager" && targetRole === "manager") return false;
  return executorRole === "owner" || executorRole === "manager";
};

// ✅ 命名規則: can〜 / is〜
canViewResignedUsers()
canUpdateShop()
canManageInvitation()
```

## API呼び出し規則

```ts
// フロントエンド
api.shop.queries.getById        // 読み取り
api.shop.mutations.create       // 書き込み

api.user.queries.getByAuthId
api.user.mutations.update

api.invite.queries.getByToken
api.invite.mutations.accept
```

## データフロー

```
[Frontend]
    ↓ useQuery / useMutation
[queries.ts / mutations.ts]
    ↓ 権限判定
[policies.ts] ← 純粋関数で判定
    ↓ DB操作
[helpers.ts] ← 共通処理
    ↓
[Convex DB]
```

## 設計原則まとめ

| 原則 | 内容 |
|------|------|
| **Feature Slices** | ドメイン単位でディレクトリ分割 |
| **CQRS** | 読み取り(queries)と書き込み(mutations)を分離 |
| **Policy Pattern** | 権限判定を純粋関数として集約 |
| **コロケーション** | 関連コードは同じディレクトリに配置 |

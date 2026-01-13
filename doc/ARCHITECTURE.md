# アーキテクチャ概要

このドキュメントは、コードベース全体の構造とナビゲーションガイドを提供します。

## ディレクトリ構造

```
src/
├── routes/           # TanStack Router（ページ呼び出しのみ）
├── components/
│   ├── pages/        # ページコンポーネント（useQuery、エラー/ローディング処理）
│   ├── features/     # 機能コンポーネント（ドメインロジック、useMutation）
│   ├── templates/    # レイアウト（BottomMenu、SideMenu等）
│   └── ui/           # 汎用UIコンポーネント
├── stores/           # Jotai状態管理
├── helpers/          # ユーティリティ関数
├── constants/        # 定数定義
├── configs/          # 設定ファイル
└── hooks/            # カスタムフック

convex/
├── schema.ts         # DBスキーマ（Single Source of Truth）
├── constants.ts      # DB定数
├── helpers.ts        # 共通ヘルパー
└── [domain]/         # ドメイン別（queries.ts, mutations.ts, policies.ts）
```

---

## 機能→ファイルマッピング

| 機能 | Pages | Features | Convex |
|------|-------|----------|--------|
| 店舗管理 | `Shops/ListPage`, `DetailPage`, `EditPage`, `NewPage` | `Shop/ShopForm`, `ShopList`, `ShopDetail`, `ShopEdit`, `ShopSelector` | `shop/queries`, `mutations` |
| スタッフ管理 | `Staffs/ListPage`, `DetailPage`, `EditPage` | `Staff/StaffList`, `StaffDetail`, `StaffEdit` | `staff/queries`, `mutations` |
| ポジション管理 | - | `Shop/PositionManager`, `PositionEditor` | `position/queries`, `mutations` |
| スキル管理 | - | `StaffDetail`内 | `staffSkill/queries`, `mutations` |
| ユーザー管理 | `MyPage`, `Settings` | `User/UserRegister`, `Setting/UserSetting` | `user/queries`, `mutations` |
| 招待機能 | `Invite` | `Shop/MemberAddModal` | `invite/queries`, `mutations` |

---

## ファイル→機能マッピング（逆引き）

### 店舗管理
| ファイルパス | 責務 |
|-------------|------|
| `src/routes/_auth/shops/` | ルーティング |
| `src/components/pages/Shops/` | useQuery、エラー/ローディング処理 |
| `src/components/features/Shop/` | ドメインロジック、UI |
| `convex/shop/` | DB操作 |

### スタッフ管理
| ファイルパス | 責務 |
|-------------|------|
| `src/routes/_auth/shops/$shopId/staffs/` | ルーティング |
| `src/components/pages/Staffs/` | useQuery、エラー/ローディング処理 |
| `src/components/features/Staff/` | ドメインロジック、UI |
| `convex/staff/` | DB操作 |

### ポジション管理
| ファイルパス | 責務 |
|-------------|------|
| `src/components/features/Shop/PositionManager/` | ポジション一覧管理 |
| `src/components/features/Shop/PositionEditor/` | ポジション個別編集 |
| `convex/position/` | DB操作 |

### スキル管理
| ファイルパス | 責務 |
|-------------|------|
| `src/components/features/Staff/StaffDetail/` | スキル表示・編集UI |
| `convex/staffSkill/` | DB操作 |

### ユーザー管理
| ファイルパス | 責務 |
|-------------|------|
| `src/routes/_auth/mypage.tsx` | マイページルーティング |
| `src/routes/_auth/settings/` | 設定ルーティング |
| `src/components/pages/MyPage/` | マイページ |
| `src/components/pages/Settings/` | 設定ページ |
| `src/components/features/User/` | ユーザー登録 |
| `src/components/features/Setting/` | 設定UI |
| `convex/user/` | DB操作 |

### 招待機能
| ファイルパス | 責務 |
|-------------|------|
| `src/routes/invite.tsx` | 招待ページルーティング |
| `src/components/pages/Invite/` | 招待受け入れページ |
| `src/components/features/Shop/MemberAddModal/` | スタッフ招待モーダル |
| `convex/invite/` | DB操作 |

---

## データフロー図

```
[ユーザー操作]
      │
      ▼
┌─────────────────────────────────────┐
│ [TanStack Router] src/routes/       │
│   - ファイルベースルーティング       │
│   - ページコンポーネント呼び出しのみ │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ [Pages] src/components/pages/       │
│   - useQuery() でデータ取得          │
│   - エラー/ローディング判定          │
│   - 正常系のみ Features 呼び出し     │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ [Features] src/components/features/ │
│   - レイアウト、UI組成               │
│   - useMutation() 定義               │
│   - ユーザー操作イベント             │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ [Convex] convex/[domain]/           │
│   - queries.ts → 読み取り           │
│   - mutations.ts → 書き込み         │
│   - policies.ts → 権限判定          │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ [Database] convex/schema.ts         │
│   - Single Source of Truth          │
└─────────────────────────────────────┘
```

---

## コンポーネント責務の詳細

### routes/ （ルーティング層）
- ページコンポーネントの呼び出し**のみ**
- 状態管理は禁止
- ビジネスロジックは禁止

### pages/ （ページ層）
- `useQuery`の呼び出し
- APIに応じたエラー、ローディング、正常ケースの振り分け
- `useMutation`の定義は禁止
- 正常系コンポーネント呼び出し時は判定完了状態

### features/ （機能層）
- レイアウト、ドメインロジックを持つ
- `useMutation`の定義
- 正常系、エラー、ローディングのコンポーネントを内包

### templates/ （レイアウト層）
- `BottomMenu`, `SideMenu`等のレイアウトコンポーネント
- `TitleTemplate`等の共通レイアウト

### ui/ （UI基盤層）
- `Select`, `FormCard`, `Title`, `Dialog`, `BottomSheet`等
- 再利用可能な汎用コンポーネント

---

## 状態管理（Jotai）

| Store | 責務 | 永続化 |
|-------|------|--------|
| `userAtom` | ログインユーザー情報 | メモリ |
| `selectedShopAtom` | 選択中の店舗情報 | localStorage |
| `hasSelectedShopAtom` | 店舗選択済み判定（派生） | - |

---

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| ビルド | Vite |
| フレームワーク | React 19 |
| ルーティング | TanStack Router |
| UI | Chakra UI v3 |
| フォーム | React Hook Form + Zod |
| 状態管理 | Jotai |
| 認証 | Clerk |
| バックエンド | Convex |
| アイコン | react-icons（Lucide） |
| フォーマット | Biome |
| テスト | Vitest / Playwright / Storybook |

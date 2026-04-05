# アーキテクチャ概要

このドキュメントは、コードベース全体の構造とナビゲーションガイドを提供します。

## ディレクトリ構造

```
src/
├── routes/           # TanStack Router（ページ呼び出しのみ）
├── components/
│   ├── pages/        # ページコンポーネント（useQuery、エラー/ローディング処理）※現在未実装
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
├── _lib/             # 共通ユーティリティ
└── {useCase}/        # ユースケース別ディレクトリ（queries.ts, mutations.ts, actions.ts）※現在未作成
```

---

## 機能→ファイルマッピング

> 現在、各機能の実装は再構築中です。以下は実装済みのコンポーネントのみ記載しています。

| 機能 | Pages | Features | Convex |
|------|-------|----------|--------|
| シフトフォーム | - | `Shift/ShiftForm` | 未実装 |

---

## ファイル→機能マッピング（逆引き）

### シフトフォーム
| ファイルパス | 責務 |
|-------------|------|
| `src/components/features/Shift/ShiftForm/` | シフト編集UI（PC版・SP版）、ドラッグ操作、表示切替 |

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
│ [Convex] convex/{useCase}/          │
│   - queries.ts → 読み取り           │
│   - mutations.ts → 書き込み         │
│   - actions.ts → 外部API呼び出し    │
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
| ShiftForm Atoms | シフト編集状態（Jotai Provider内スコープ） | メモリ |

---

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| ビルド | Vite |
| フレームワーク | React 19 |
| ルーティング | TanStack Router |
| UI | Chakra UI v3 |
| フォーム | React Hook Form + Zod 4 |
| 状態管理 | Jotai |
| 認証 | Clerk |
| バックエンド | Convex |
| アイコン | react-icons（Lucide） |
| フォーマット | Biome |
| テスト | Vitest / Playwright / Storybook |

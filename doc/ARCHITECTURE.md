# アーキテクチャ概要

このドキュメントは、コードベース全体の構造とナビゲーションガイドを提供します。

フロントエンドのディレクトリ、依存方向、ファイル内部の責務は `doc/rules/frontend-architecture.md` を Source of Truth とします。
Convexの認証境界、公開API、非同期workflow、データ寿命、運用契約は `doc/rules/convex-design-strategy.md` を Source of Truth とします。
このドキュメントでは、現在の機能配置とシステム全体のデータフローを扱います。

## ディレクトリ構造

```
src/
├── routes/           # TanStack Router（ルーティング定義・head・検索/パラメータ受け渡しのみ）
├── pages/            # route全体のquery、metadata、エラー/ローディング処理、画面構成
├── components/
│   ├── features/     # 機能コンポーネント（feature-local query、useMutation、操作イベント）
│   ├── shared/       # 複数featureで使う業務UI
│   ├── templates/    # レイアウト（Header、StaffLayout、PublicPageLayout等）
│   └── ui/           # 汎用UIコンポーネント
├── domains/          # ドメイン型・純粋ロジック・画面横断で安定した業務値の表記
├── providers/        # React Provider・SDK初期化
├── stores/           # Jotai状態管理
├── hooks/            # 横断的なReact hook
├── lib/              # 技術的な共通処理
├── configs/          # 設定ファイル
├── assets/           # 複数featureで共有するimport asset
└── devtools/         # 本番から参照しない開発用UI

convex/
├── schema.ts         # DBスキーマ（Single Source of Truth）
├── constants.ts      # DB定数
├── _lib/             # 共通ユーティリティ
└── {useCase}/        # ユースケース別ディレクトリ（schemas.ts, queries.ts, mutations.ts, actions.ts）
```

---

## 機能→ファイルマッピング

> 以下は現在の主要な画面境界とfeatureの対応です。配置判断の詳細はフロントエンド方針を参照してください。

| 機能 | Pages | Features | Convex |
|------|-------|----------|--------|
| ダッシュボード | `src/pages/dashboard/` | `Dashboard/*` | `dashboard`, `staff`, `recruitment`, `shop`, `line`, `legal`, `setup` |
| シフト表 | `src/pages/shift-board/` | `ShiftBoard/*`, `Shift/ShiftForm` | `shiftBoard`, `notification` |
| スタッフ希望提出 | `src/pages/staff-shift-submit/` | `StaffSubmit/*` | `shiftSubmission`, `staffAuth` |
| スタッフシフト閲覧 | `src/pages/staff-shift-view/` | `StaffView/*`, `Shift/ShiftForm` | `staffAuth`, `shiftView` |
| シフトフォーム | - | `Shift/ShiftForm` | - |

---

## ファイル→機能マッピング（逆引き）

### シフトフォーム
| ファイルパス | 責務 |
|-------------|------|
| `src/components/features/Shift/ShiftForm/` | シフト編集UI（PC版・SP版）、ドラッグ操作、表示切替 |
| `src/domains/shift/` | シフト型、日付/時刻変換、シフト操作、スタッフソート |

---

## データフロー図

```
[ユーザー操作]
      │
      ▼
[routes: URL、head、params/search]
      │
      ▼
[pages: route全体のqueryと状態分岐]
      ├── route-wide query ───────────────┐
      │                                  │
      ▼                                  ▼
[features: ユースケースと操作状態]   [Convex API]
      ├── feature-local query ────────────┤
      ├── mutation / action ──────────────┤
      │                                  │
      └── domains / script.ts            ▼
          純粋な判定と変換           [Database]
```

`domains/` はConvexへ依存しない。
`script.ts` は共有された純粋schemaを参照できるが、Convex client hookは使わない。
pageまたはfeatureがConvexとの接続と純粋処理の呼び出し順を所有する。

Convex側で新規実装または見直しを行う場合の標準フローは、public APIまたはHTTP routeが分類済みの信頼境界を検証し、mutationが永続的な処理意図を保存する形とする。
中断復旧が必要な外部副作用と多数対象へのfanoutはinternal workerへ渡し、再開に必要な状態をDBへ保持する。
これは目標設計であり、既存フローが適合済みであることを示す記述ではない。

---

## コンポーネント責務の詳細

責務の詳細は `doc/rules/frontend-architecture.md` に集約します。

| 層 | 主な責務 |
|---|---|
| routes | URL、head、search/params、route group |
| pages | route全体のqueryと画面状態分岐、featureの組み立て |
| features | ユースケース、feature-local query、mutation/action、操作状態 |
| shared | 複数featureで使う業務UI |
| templates | ページとアプリのレイアウト |
| ui | ドメイン非依存のUI基盤 |
| domains | 画面非依存の業務型と純粋ロジック |

---

## 状態管理（Jotai）

| Store | 責務 | 永続化 |
|-------|------|--------|
| `userAtom` | ログインユーザー情報 | メモリ |
| `selectedShopAtom` | 最後に確定した有効な店舗情報。URLに店舗指定がない場合のfallback | localStorage |
| `hasSelectedShopAtom` | 店舗選択済み判定（派生） | - |
| ShiftForm Atoms | シフト編集状態（Jotai Provider内スコープ） | メモリ |

認証済み画面の現在タブでは`?shop=`を店舗コンテキストの正とする。
URLの値は`getMyShops`の候補と照合し、一致したAPI由来の店舗だけを`selectedShopAtom`へ同期して管理者APIへ渡す。
URL指定がない場合はlocalStorageの有効な前回値、利用可能店舗一覧の先頭の順で補完し、`replace`でURLを正規化する。
localStorageは初回fallbackと前回値保存に限定し、別タブの更新で現在タブのURLコンテキストを上書きしない。

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

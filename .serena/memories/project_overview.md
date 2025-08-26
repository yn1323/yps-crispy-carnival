# プロジェクト概要

## プロジェクト名
**yps-crispy-carnival** - 勤怠管理システム

## 🎯 プロジェクトの目的
Next.js 15をベースとした勤怠・シフト管理システム。以下の機能を提供：

### 主要機能エリア（app構造より）
- **勤怠管理** (`(auth)/attendance/`) - 勤怠記録・管理
- **シフト管理** (`(auth)/shifts/`) - シフト作成・調整
- **店舗管理** (`(auth)/shops/`) - 店舗情報・編集・招待
- **タイムカード** (`(auth)/timecard/`) - 打刻システム
- **マイページ** (`(auth)/mypage/`) - ユーザー情報管理
- **設定** (`(auth)/settings/`) - アプリケーション設定
- **ユーザー設定** (`config/user/`) - 個人設定

## 🏗️ プロジェクト構造

### ディレクトリ構成
```
yps-crispy-carnival/
├── app/                          # Next.js App Router（メインアプリ）
│   ├── (auth)/                   # 認証後エリア
│   │   ├── attendance/           # 勤怠機能
│   │   ├── shops/               # 店舗管理（new, [id]/edit, [id]/invite）
│   │   ├── shifts/              # シフト管理
│   │   ├── timecard/            # タイムカード
│   │   ├── mypage/              # マイページ
│   │   └── settings/            # 設定
│   └── config/                   # 設定ページ
├── src/                          # ソースコード
│   ├── components/               # Reactコンポーネント
│   │   ├── features/            # 機能固有（register/*）
│   │   ├── layout/              # レイアウト（SideMenu）
│   │   ├── templates/           # テンプレート（Animation）
│   │   └── ui/                  # UI基盤（provider, toaster, tooltip）
│   ├── services/                # API・データ取得（clientFetch, serverFetch）
│   ├── stores/                  # Jotai状態管理
│   ├── helpers/                 # ユーティリティ関数
│   ├── types/                   # TypeScript型定義
│   └── constants/               # 定数・バリデーションスキーマ
├── e2e/                         # E2Eテスト（Playwright）
├── .storybook/                  # Storybookの設定
└── doc/                         # ドキュメント
```

## 🎨 デザインシステム・UI
- **Chakra UI v3** - Modern API準拠
- **next-themes** - ダーク・ライトモード対応
- **React Icons** - アイコン
- **Emotion** - CSS-in-JS

## 📱 レスポンシブ戦略
- **2段階ブレイクポイント** - PC/SP対応
- **配列記法**使用（例: `fontSize={["sm", "md"]}`）

## 🔐 認証・状態管理
- **Jotaiによるアトミック状態管理** - ドメイン別ストア定義
- **Cookieベース認証**サポート
- クライアントサイド状態とUIデータ管理

## 📊 フォーム管理
- **React Hook Form** + **Zodバリデーション**
- 統一パターン: `schema.ts` + `actions.ts` + `index.tsx` + `stories.tsx`
- 一元的バリデーション（`src/constants/validations.ts`）

## 🛠️ 開発環境
- **Node.js** + **pnpm**（パッケージマネージャー）
- **TypeScript**（厳格設定、型推論活用）
- **Turbopack**（開発・ビルド高速化）
- **Biome**（lint + format）

## 💡 開発思想・原則
- **Feature-First + コロケーション**パターン
- **Arrow Function必須** / Function Declaration禁止
- **type使用** / interface禁止
- **Props Drilling容認** / Context API禁止
- **Early Return必須**
- **バレルエクスポート禁止**
- **UTF-8**使用
---
name: e2e-execution
description: Claude Code Web/DesktopでE2Eテストを実行する手順。GitHub Actionsと同じフローでローカル環境からPlaywrightテストを実行する方法。環境変数読み込み、DBリセット、テスト実行の手順を含む。
---

# Claude Code Web(Claude Code Desktop)のE2E実行

GitHub Actionsと同じフローでローカル環境からE2Eテストを実行する手順です。

## 前提条件
- `.env.ci`ファイルがシンボリックリンクで設定済み
- 必要な環境変数が`.env.ci`に含まれている:
  - `VITE_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - `E2E_CLERK_USER` / `E2E_CLERK_PASSWORD`
  - `E2E_CLERK_USER_B` / `E2E_CLERK_PASSWORD_B`（User Bテスト用）
  - `CONVEX_DEPLOY_KEY`

## 実行手順

### 1. 環境変数の読み込み
```bash
# .env.ciの環境変数を現在のシェルに読み込む
export $(grep -v '^#' .env.ci | xargs)
```

### 2. DBのリセット（テストデータ投入）
```bash
# Convex開発サーバーを起動してデータをリセット
npx convex dev &
sleep 5
pnpm convex:import
kill %1
```

### 3. E2Eテストの実行
```bash
# Convex開発サーバーを起動してテスト実行
npx convex dev &
sleep 10
pnpm e2e
kill %1
```

### 簡易コマンド（一括実行）
```bash
# 環境変数読み込み → DBリセット → E2Eテスト実行
export $(grep -v '^#' .env.ci | xargs) && \
npx convex dev & sleep 5 && pnpm convex:import && kill %1 && \
npx convex dev & sleep 10 && pnpm e2e && kill %1
```

## UIモードでの実行（デバッグ用）
```bash
export $(grep -v '^#' .env.ci | xargs)
npx convex dev &
sleep 15
pnpm e2e:ui
# 終了後: kill %1
```

## 注意事項
- E2EテストはリモートのPreview環境DBに接続します
- テスト実行前に`pnpm convex:import`でDBをリセットすることを推奨
- `playwright.config.ts`で`reuseExistingServer`が設定されているため、別ターミナルで`pnpm dev`を起動しておくと効率的です

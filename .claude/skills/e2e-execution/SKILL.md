---
name: e2e-execution
description: Claude Code Web/DesktopでE2Eテストを実行する手順。GitHub Actionsと同じフローでローカル環境からPlaywrightテストを実行する方法。環境変数読み込み、DBリセット、テスト実行の手順を含む。
---

# Claude Code Web(Claude Code Desktop)のE2E実行

GitHub Actionsと同じフローでローカル環境からE2Eテストを実行する手順です。

## 前提条件
- 必要な環境変数がある:
  - `VITE_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - `E2E_CLERK_USER` / `E2E_CLERK_PASSWORD`
  - `E2E_CLERK_USER_B` / `E2E_CLERK_PASSWORD_B`（User Bテスト用）
  - `CONVEX_DEPLOY_KEY`

## 実行手順

### 1. pnpm install
```bash
pnpm install --frozen-lockfile
```

### 2. DBのリセット（テストデータ投入）
```bash
# Convex開発サーバーをバックグラウンドで起動
npx convex dev &
# 起動完了を確認後、データをリセット
pnpm convex:import
```

### 3. アプリケーションの起動
```bash
# Vite開発サーバーをバックグラウンドで起動
pnpm dev &
# 起動完了を確認（http://localhost:3000 が応答するまで待つ）
```

### 4. E2Eテストの実行
```bash
# Convex開発サーバーとアプリが起動している状態で実行
pnpm e2e
```

## 注意事項
- E2EテストはリモートのPreview環境DBに接続します
- テスト実行前に`pnpm convex:import`でDBをリセットすることを推奨
- AIが制御する場合、sleepやkillは不要（起動完了を確認してから次のステップへ進む）

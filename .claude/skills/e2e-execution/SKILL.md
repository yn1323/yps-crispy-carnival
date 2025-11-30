---
name: e2e-execution
description: Claude Code Web/DesktopでE2Eテストを実行する手順。ローカル開発と同じ方式でPlaywrightテストを実行する方法。
---

# Claude Code Web(Claude Code Desktop)のE2E実行

ローカル開発と同じ方式でE2Eテストを実行する手順です。

## 実行手順

### 1. pnpm install
```bash
pnpm install --frozen-lockfile
```

### 2. Convex環境変数の設定（初回のみ）
```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN=$CLERK_JWT_ISSUER_DOMAIN
```

### 3. Convex開発サーバーの起動
```bash
npx convex dev &
```

### 4. DBのリセット（テストデータ投入）
```bash
pnpm convex:import
```

### 5. アプリケーションの起動
```bash
pnpm dev &
```

### 6. E2Eテストの実行
```bash
pnpm e2e
```

## 注意事項
- テスト実行前に`pnpm convex:import`でDBをリセットすることを推奨
- AIが制御する場合、sleepやkillは不要（起動完了を確認してから次のステップへ進む）

# 作業完了時の手順チェックリスト

## 🚨 必須実行順序（CLAUDE.mdより厳格遵守）

**この順番で実行すること。必ずSub Agentで並列化すること！**

### 1. 単体テスト実行
```bash
pnpm test
```
- すべてのVitestテスト（logic + ui）を実行
- エラーが0件になるまで修正

### 2. E2Eテスト実行
```bash
pnpm e2e:no-report {必要なテストファイル名}
```
- 関連するE2Eテストを実行
- まとめて実行してもOK
- レポートなしでの実行を推奨

### 3. Linter自動修正
```bash
pnpm lint:fix
```
- Biomeによる自動修正を実行
- コードスタイルの問題を自動解決

### 4. TypeScript型チェック
```bash
pnpm type-check
```
- TypeScriptコンパイラーでの型チェック
- 型エラーが0件になるまで修正

### 5. Linterチェック（最終確認）
```bash
pnpm lint
```
- 最終的なlintチェック
- 警告・エラーが0件であることを確認

## ✅ Sub Agent並列実行のポイント

- **Task tool**で各コマンドを並列実行
- 各コマンドの結果を個別に確認
- エラーがある場合は該当箇所を修正後、再実行

## 🚫 絶対禁止事項

### テストに関する禁止事項
- ❌ **data-testidの使用** - セマンティック要素を使用
- ❌ テストのスキップ・無効化
- ❌ エラーを無視しての作業完了

### コード品質に関する禁止事項
- ❌ lint警告・エラーの放置
- ❌ 型エラーの放置
- ❌ 手動でのコード整形（Biome使用必須）

## 💡 トラブルシューティング

### テストが失敗する場合
1. エラーメッセージを確認
2. 関連するテストファイルを修正
3. 必要に応じて新しいテストを追加
4. 再度テスト実行

### Lintエラーが出る場合
1. `pnpm lint:fix`で自動修正可能なものは修正
2. 手動修正が必要な場合はCLAUDE.mdの規約に従って修正
3. 特にArrow Function、type使用、Early Returnなどの原則を確認

### 型エラーが出る場合
1. TypeScript型推論を活用
2. 必要最小限の型注釈のみ追加
3. interface禁止、type使用の原則を確認

## 📋 作業完了チェック項目

- [ ] `pnpm test` - 単体テスト成功
- [ ] `pnpm e2e:no-report` - E2Eテスト成功  
- [ ] `pnpm lint:fix` - 自動修正実行
- [ ] `pnpm type-check` - 型チェック成功
- [ ] `pnpm lint` - Lintチェック成功
- [ ] すべてのエラー・警告が解消済み
- [ ] コード品質基準を満たしている

## 🎯 品質基準確認

### コーディング規約準拠
- Arrow Function使用
- type定義（interface禁止）
- const使用（let最小限）
- 分割代入活用
- async/await（Promise.then禁止）
- Early Return実装
- Props Drilling容認（Context API禁止）

### ファイル構成
- コンポーネント + stories + schema + actions
- Explicit Import（バレルエクスポート禁止）
- UTF-8使用
- 適切なディレクトリ配置

**💪 すべての項目をクリアしてから作業完了とする！**
# src/AGENTS.md

このファイルは `src/` 配下へ適用する。
ルートの `AGENTS.md` と併せて読む。

## 必読

- 実装・レビュー前に `doc/rules/frontend-architecture.md` を読む。
- UI/UXや文言を扱う場合は `doc/rules/ui-design.md` を読み、`ui-architect` を使う。
- テスト層、配置、新しい検証契約を判断する場合は `doc/rules/testing-strategy.md` を読み、`test-strategy` を使う。
- ArticleSiteとHowToSiteでは、各ディレクトリの `AGENTS.md` も読む。

## 常時制約

- 配置、依存方向、公開入口、ファイル責務は `doc/rules/frontend-architecture.md` に従う。
- フロントエンドの表示制御だけを認可として扱わず、権限はConvex側でも検証する。
- UIは既存のChakra UI v3パターンと `src/components/ui/` の部品を優先する。
- テストの責務は `doc/rules/testing-strategy.md` に従い、同じ層の近いテストを追従更新する場合は既存パターンを優先する。

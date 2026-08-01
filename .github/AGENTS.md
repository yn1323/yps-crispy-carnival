# .github/AGENTS.md

このファイルは `.github/` 配下へ適用する。
ルートの `AGENTS.md` と併せて読む。

## 正本

- workflow、trigger、権限、environment、job依存、現在のリリース条件は `.github/workflows/*.yml` を正とする。
- 人が行うブランチ、Preview、release、障害対応は `doc/manual/ci-cd.md` を参照する。
- テスト層とFull Regressionの役割は `doc/rules/testing-strategy.md` を参照する。
- セキュリティ境界を変更する場合は `doc/rules/security-strategy.md` を読み、`shiftori-security-review` を使う。

このファイルへworkflow一覧、secret名、environment値、現在件数を複製しない。

## 常時制約

- `permissions` はworkflowまたはjobの責務に必要な最小限へ限定する。
- third-party Actionはversionを明示し、`main`や`master`などの追従参照を使わない。
- secret、token、credential、個人情報をworkflow、ログ、artifact、summaryへ出さない。
- fork由来の未信頼コードへsecretやwrite権限を渡さない。
- `pull_request_target` でPull Requestのheadをcheckoutして実行しない。
- cleanupや削除処理では対象を明示し、credentialを渡した状態で未信頼のPull Requestコードを実行しない。
- same-repository Pull Requestだけに権限を与える場合は、repository一致を明示的に検証する。
- user-controlledなbranch名、label、artifact名、outputをshellへ直接展開しない。
- environment protectionとapprovalを回避する別経路を追加しない。
- security scan、lint、type-check、test、migration確認を `continue-on-error` で無効化しない。
- deploy、migration、cleanupの依存順を変更する場合は、失敗時と再実行時の状態を設計する。
- concurrencyを変更する場合は、古い実行による上書き、二重deploy、cleanup競合を防ぐ。

## PreviewとFull Regression

- Previewは未信頼コードを扱う境界として設計する。
- Full Regressionは主要導線の退行を検知するもので、実装詳細や静的文言を網羅しない。
- E2Eを変更する場合は `e2e/AGENTS.md` も読む。
- reportの公開処理は、artifactの出所、保存期間、公開範囲、失敗時の表示を確認する。
- cleanupは対象を明示し、別branchや別Pull Requestの資産を削除しない。

## Release

- developとproductionの昇格条件は、workflowに定義されたbranch、label、environment gateを維持する。
- schemaや保存済みデータを変えるreleaseでは、`convex-migration-helper` の計画とmigration完了確認を先に行う。
- rollbackはコードだけでなく、schema、migration、外部副作用の互換性を確認する。

## 検証

- YAML構文だけでなく、trigger、permissions、if条件、job依存、concurrencyを差分で確認する。
- 変更したworkflowが参照するscriptとpackage scriptも確認する。
- GitHub Actionsのsecurity scanが失敗した場合は、根拠なく除外を追加せず、原因と適用範囲を特定する。
- 実行方法と確認手順は `doc/manual/ci-cd.md` に置き、このファイルへ手順を重複させない。

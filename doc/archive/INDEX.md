# Archiveインデックス

Archiveには、廃止、置換、棄却された資料と特定時点の監査結果を保存します。
本文は現行仕様へ追従させないため、現在の判断には「後継文書」を使ってください。

## 旧機能・旧設計

| 資料 | 元のパス | 理由 | Archive日 | 後継文書 |
|---|---|---|---|---|
| [店舗単位課金プランの旧検討](features/billing-plans.md) | `doc/features/billing-plans.md` | `superseded` | 2026-07-23 | [グループ課金、複数店舗、複数管理者](../features/organization-billing.md)、[業務フロー](../specs/organization-billing-business-flow.md) |
| [店舗単位の請求管理者ロールに関する旧検討](features/manager-billing-roles.md) | `doc/features/manager-billing-roles.md` | `superseded` | 2026-07-23 | [グループ課金、複数店舗、複数管理者](../features/organization-billing.md)、[業務フロー](../specs/organization-billing-business-flow.md) |

## 時点監査

| 資料 | 元のパス | 理由 | Archive日 | 現在の確認先 |
|---|---|---|---|---|
| [2026-07-21 セキュリティ再検証台帳](audits/2026/security-validation-2026-07-21.md) | `doc/manual/security-validation-2026-07-21.md` | `point-in-time-audit` | 2026-07-23 | [セキュリティ再検証](../manual/security-validation.md)、[リリース状態](../manual/release-status.md) |
| [2026-08-12 PRレビューコメント現況監査](audits/2026/pr-review-comments-audit-2026-08-12.md) | `doc/plans/2026-08-12_PRレビューコメント現況監査.md` | `point-in-time-audit` | 2026-08-12 | [テスト方針](../rules/testing-strategy.md)、[セキュリティ方針](../rules/security-strategy.md)、[リリース状態](../manual/release-status.md) |

## 理由の種類

- `superseded`：後継の設計または文書に置き換えられた資料。
- `abandoned`：採用せず終了した資料。
- `rejected`：検討の結果、明示的に不採用とした資料。
- `point-in-time-audit`：特定日時点の調査や検証結果。
- `removed-feature`：提供を終了した機能の資料。

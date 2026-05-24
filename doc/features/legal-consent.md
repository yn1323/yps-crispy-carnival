# 法務同意フロー

管理ユーザーとスタッフそれぞれに、利用規約・プライバシーポリシーの同意を記録する機能。文書版と同意要求版を分け、軽微な文書更新では再同意を求めない。スタッフは未同意でもシフト関連通知を受け取れ、シフト提出などの能動操作時に同意を回収する。初回セットアップで manager として同意したユーザーは同時に manager staff としても同意済みにするため、自分のシフト提出時にスタッフ向け同意欄は表示しない。

## 関連ファイル

- `convex/legal/documents.ts` — 文書版、同意要求版、公開パス、同意判定 helper
- `convex/legal/queries.ts` / `convex/legal/mutations.ts` / `convex/legal/actions.ts` — スタッフ同意ページ、同意記録、同意依頼メール/LINE
- `convex/schema.ts` — `legalConsentTokens` / `legalConsentEvents` と `users` / `staffs` の最新同意トップレベル項目
- `src/components/features/StaffLegalConsent/ConsentPage/` — スタッフ同意ページ UI
- `src/components/features/Dashboard/LegalReconsentBanner/` — 管理ユーザー再同意バナー
- `src/components/features/Terms/` / `src/components/features/PrivacyPolicy/` — 管理ユーザー/スタッフ向け法務文書
- `doc/manual/legal-versioning.md` — 文書更新時のバージョン更新メモ

## 画面一覧

| 画面 | 役割 |
|---|---|
| `/terms/manager` | 管理ユーザー向け利用規約 |
| `/privacy/manager` | 管理ユーザー向けプライバシーポリシー |
| `/terms/staff` | スタッフ向け利用規約 |
| `/privacy/staff` | スタッフ向けプライバシーポリシー |
| `/legal/staff/consent` | スタッフ向け同意リンクの受け口 |
| 店舗セットアップモーダル | 管理ユーザーの初回同意 |
| ダッシュボード | 管理ユーザーの再同意バナー |
| シフト提出画面 | 未同意/旧バージョン同意スタッフの提出時同意 |

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.legal.queries.getManagerConsentStatus` | query | 管理ユーザーの再同意要否を取得 |
| `api.legal.mutations.acceptManagerLegalConsent` | mutation | 管理ユーザーの再同意を記録 |
| `api.legal.queries.getStaffConsentPageData` | query | スタッフ同意リンクの表示データ取得 |
| `api.legal.mutations.acceptStaffLegalConsent` | mutation | スタッフ同意リンクから同意を記録 |
| `internal.legal.mutations.createStaffConsentToken` | internalMutation | 30日有効のスタッフ同意トークン発行 |
| `internal.legal.actions.sendStaffConsentEmail` | internalAction | スタッフ追加時の同意依頼メール送信 |
| `internal.legal.actions.sendStaffConsentLine` | internalAction | LINE連携後の未同意スタッフへの同意案内 |
| `api.setup.mutations.setupShopAndManager` | mutation | 管理ユーザー同意を含めた店舗初期セットアップ |
| `api.shiftSubmission.mutations.submitShiftRequests` | mutation | 未同意スタッフの提出時同意を記録 |

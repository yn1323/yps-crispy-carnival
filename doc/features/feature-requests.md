# 要望受付

ログイン済みの管理ユーザーと、希望シフト提出中のスタッフが、ヘッダーの小さなDialogから200文字以内の要望を送る機能。

要望は店舗と送信者に紐づけて保存し、analytics-dashboardの `要望` タブで新しい順に確認する。

## 関連ファイル

- `src/components/features/AuthenticatedApp/AuthenticatedHeader/index.tsx`
- `src/components/features/FeatureRequestDialog/`
- `src/components/templates/Header/index.tsx`
- `convex/featureRequest/schemas.ts`
- `convex/featureRequest/mutations.ts`
- `convex/schema.ts`
- `convex/analyticsDashboard/dto.ts`
- `convex/analyticsDashboard/schemas.ts`
- `convex/analyticsDashboard/queries.ts`
- `apps/analytics-dashboard/src/features/dashboard/FeatureRequestsTabContent.tsx`
- `apps/analytics-dashboard/src/pages/DashboardPage.tsx`

## 画面一覧

| 画面 | パス | 用途 |
|---|---|---|
| 要望Dialog | 管理者ヘッダー・スタッフ提出ヘッダー | 選択中店舗またはスタッフセッションの店舗についての要望を200文字以内で送る |
| 要望一覧 | analytics-dashboard `/` の `要望` タブ | 要望を受付日時の新しい順に50件ずつ確認する |

SPの要望Dialogは入力が1項目だけなので、フルスクリーンにせず左右16pxの余白を残す。

## データ

`featureRequests` に次のフィールドを保存する。

- `shopId`
- `userId`（管理ユーザーからの送信時）
- `staffId`（スタッフからの送信時）
- `comment`
- `requestId`
- `_creationTime`

`shopId`は選択中店舗としてクライアントから渡されるが、`managerMutation`がactiveな店舗所属を検証する。

`userId`と`staffId`はクライアントから受け取らず、管理者認証またはスタッフセッションから確定する。

`staffId`の追加と`userId`のoptional化は既存レコードをそのまま許容するWiden変更のため、データ移行は不要である。

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `featureRequest/mutations:submit` | manager mutation | 要望の検証、冪等性、送信頻度制限、保存 |
| `featureRequest/mutations:submitFromStaff` | staff session mutation | スタッフセッションを検証し、要望を店舗とstaffIdに紐付けて保存 |
| `analyticsDashboard/queries:getFeatureRequests` | internal query | 要望を新しい順に50件までページングし、店舗名と送信者種別を返す |
| `analyticsDashboard/httpActions:query` | HTTP action | `featureRequests` requestをinternal queryへ渡す |

要望送信ではメールとSlack通知を行わない。

analytics DTOには管理ユーザーのメールアドレスを含めない。

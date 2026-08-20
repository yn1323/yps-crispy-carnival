# 要望受付

ログイン済みの管理ユーザーと、希望シフト提出中のスタッフが、ヘッダーの小さなDialogから200文字以内の要望を送る機能。

要望は画面から特定できる店舗、または現在の組織と送信者に紐づけて保存し、analytics-dashboardの独立した`/requests`画面で新しい順に確認する。

## 関連ファイル

- `src/components/templates/AuthenticatedAppShell/index.tsx`
- `src/components/features/AuthenticatedApp/AppOrganizationScope/`
- `src/components/features/FeatureRequestDialog/`
- `src/components/templates/Header/index.tsx`
- `convex/featureRequest/schemas.ts`
- `convex/featureRequest/mutations.ts`
- `convex/schema.ts`
- `convex/analyticsDashboard/dto.ts`
- `convex/analyticsDashboard/schemas.ts`
- `convex/analyticsDashboard/queries.ts`
- `apps/analytics-dashboard/src/features/requests/RequestsView.tsx`
- `apps/analytics-dashboard/src/pages/RequestsPage.tsx`
- `apps/analytics-dashboard/src/server/analyticsRoutes.ts`

## 画面一覧

| 画面 | パス | 用途 |
|---|---|---|
| 要望Dialog | 管理者ヘッダー・スタッフ提出ヘッダー | 対象選択を求めず、200文字以内の本文だけで要望を送る |
| 要望一覧 | analytics-dashboard `/requests` | 要望を受付日時の新しい順に50件ずつ確認する |

SPの要望Dialogは入力が1項目だけなので、フルスクリーンにせず左右16pxの余白を残す。  組織や店舗は内部で紐づけ、利用者には選択させない。

## データ

`featureRequests` に次のフィールドを保存する。

- `organizationId`（店舗を特定できない認証済みアプリ画面からの送信時）
- `shopId`（店舗を特定できる管理画面またはスタッフ画面からの送信時）
- `userId`（管理ユーザーからの送信時）
- `staffId`（スタッフからの送信時）
- `comment`
- `requestId`
- `_creationTime`

`/dashboard`や認証済みの組織スコープ画面では、Homeや店舗詳細など画面からactive店舗を一意に特定できる場合だけ、内部で`shopId`を付ける。  店舗を特定できない場合は先頭店舗へfallbackせず、`organizationId`を付ける。  どちらの場合もDialogに対象選択UIは出さない。

`submitForOrganization`はclientから渡された`expectedOrganizationId`とoptionalな`shopId`を信用しない。  送信者のcanonicalな組織所属を必ず検証し、店舗付きの場合は店舗の組織一致とactive状態もserverで再検証する。  Business write policyも送信時に再確認する。

旧client用の`submit`は選択中店舗をクライアントから受け取り、`managerMutation`でactiveな店舗所属を検証する互換APIとして維持する。  `/dashboard`と認証済みの組織スコープ画面はbrowser storageの店舗IDを組織や店舗の認可根拠に使わない。

`userId`と`staffId`はクライアントから受け取らず、管理者認証またはスタッフセッションから確定する。

`organizationId`の追加と`shopId`のoptional化は、既存の店舗付きレコードをそのまま許容するWiden変更である。  public mutationは`organizationId`または`shopId`のどちらか一方だけを保存する。  backfillやデータ移行は不要である。

`/requests`は、analytics-dashboardが運用tableを直接読む唯一の例外である。  
internal queryは`featureRequests`を新しい順に読み、店舗対象は現在の`shops`、組織対象は現在の`organizations`から表示名を解決する。  一pageの上限は50件で、Analytics generationや日次snapshotには取り込まない。

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `featureRequest/mutations:submit` | manager mutation | 要望の検証、冪等性、送信頻度制限、保存 |
| `featureRequest/mutations:submitForOrganization` | authenticated mutation | canonicalな組織所属とoptionalな店舗scopeを検証し、同じ入力検証・冪等性・送信頻度制限で保存 |
| `featureRequest/mutations:submitFromStaff` | staff session mutation | スタッフセッションを検証し、要望を店舗とstaffIdに紐付けて保存 |
| `analyticsDashboard/queries:getFeatureRequests` | internal query | 要望を新しい順に最大50件ずつcursor paginationし、対象種別・対象名、送信者種別、commentを返す |
| `GET` `/api/requests` | Worker BFF | 固定endpointから要望queryだけをHTTP Actionへ渡す |
| `POST /analytics-dashboard/query` | HTTP action | service credentialと固定request kindを検証してinternal queryを呼ぶ |

要望送信ではメールとSlack通知を行わない。

analytics DTOには管理ユーザーのメールアドレスを含めない。`/requests`のmetadataはpipelineとは独立した現在値であることをwarningで示す。

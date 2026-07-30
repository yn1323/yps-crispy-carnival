# トライアル終了前Dashboard案内

Pro継続を登録していないグループに対し、トライアル最終日の7日前からDashboardへCalloutを表示する。どの店舗を選択していても同じグループ課金stateを参照し、グループ設定の「プランと支払い」へ案内する。

ダークローンチ中、このCalloutは表示されない。`m022_organization_billing_to_complimentary_business`が全グループを支払い不要Businessへ寄せるため、トライアル状態のグループが存在しない。案内先の「プランと支払い」タブも公開していない。公開範囲は[グループ課金、複数店舗、複数管理者](organization-billing.md)を参照する。

## 関連ファイル

### フロントエンド（`src/`）

- `src/pages/dashboard/index.tsx` — 選択中店舗の通知DTOと支払い設定への店舗コンテキストを渡す
- `src/components/features/Dashboard/DashboardContent/index.tsx` — 法務再同意と通常の「TODO」の間へCalloutを合成する
- `src/components/features/Dashboard/TrialEndingCallout/` — 表示期間、JST日付、時刻境界の再評価、Callout UI、Storybookを所有する

### バックエンド（`convex/`）

- `convex/dashboard/queries.ts` — 選択店舗から検証済みグループを解決し、トライアル終了通知の最小DTOを返す
- `convex/organizationBilling/notification.ts` — メール通知と共通の7日前境界を定義する
- `convex/organizationBilling/policy.ts` — トライアル終了境界とプランstateの契約を定義する

## 画面一覧

| 画面 | 役割 |
|---|---|
| シフト担当者ダッシュボード | トライアル終了日とFree移行後の制限を表示し、選択中店舗を保ったまま支払いタブへ移動する |
| グループ設定 > プランと支払い | Pro継続の登録状態と利用可能な契約操作を表示する |

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.dashboard.queries.getDashboardShop` | `managerQuery` | 店舗情報、業務更新可否、未登録トライアルの `visibleFrom` / `trialEndsAt` を返す |

## 表示ルール

- 課金stateが `trial` かつ `selectedPaidPlan` 未設定の場合だけ通知候補を返す。旧 `business` を含め、Pro継続が登録済みなら表示しない。
- 表示期間は `[trialEndsAt - 7日, trialEndsAt)` の半開区間とする。
- `trialEndsAt` は最終利用日の翌日0:00 JSTという排他的境界なので、画面には `trialEndsAt - 1ms` の月日を表示する。
- Convex queryは現在時刻を読まず、ブラウザが開始・終了境界で表示を再評価する。
- 同じグループの全非削除店舗で同じ通知を表示する。別グループの課金stateは、選択中店舗に対する `managerQuery` の認可境界を越えて返さない。
- Calloutは手動で閉じられない。Pro継続登録またはトライアル終了という課金state・時刻の変化で自動的に消える。
- 支払いリンクは選択中の `shop` と `tab=billing` を保持する。リンク自体は課金操作の権限を与えず、契約操作は既存のサーバー認可に従う。

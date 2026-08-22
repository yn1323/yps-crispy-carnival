# トライアル終了前Dashboard案内

Dashboardの現在プラン表示は、`getDashboardShop`が返す認可済み`planStatus`を正本にする。
この文書で扱うCalloutは、新しい`planStatus`を返さない旧backendとrolling deployする間だけ、有料プランの継続を登録していない組織へトライアル最終日の7日前から表示する互換導線である。

現在プラン表示、旧Callout、支払い導線は常時利用できる。  操作可否は認可済み`planStatus`と課金capabilityに従い、Productionへの反映済み判定はリポジトリ実装と分けて[組織課金、複数店舗、複数管理者](organization-billing.md)と[リリース状態](../manual/release-status.md)を参照する。

## rolling deploy中の優先順位

`planStatus`が値を持つ場合は、Trialを含む現在の課金状態を新しい現在プラン表示へ投影し、旧Calloutを描画しない。
`planStatus: null`は`planStatus`対応backendによる「表示対象なし」という明示結果なので、`trialEndingNotice`が残っていても旧Calloutへfallbackしない。
`planStatus`が`undefined`の場合だけ旧backendの応答と判定し、`trialEndingNotice`を旧Calloutへ渡す。

新しいbackendとfrontendのdrainを確認した後、この文書のCallout、`trialEndingNotice`、`undefined`によるfallbackはNarrowで削除する。

## 関連ファイル

### フロントエンド（`src/`）

- `src/pages/dashboard/index.tsx` — 認可済み`planStatus`と旧backend用の通知DTOを表示境界へ渡し、支払い導線を`/manage/billing?org=<organizationId>`へ接続する
- `src/components/features/Dashboard/DashboardContent/index.tsx` — 現在プラン表示を優先し、旧backendの場合はCalloutを合成する
- `src/components/features/Dashboard/PlanStatusCard/` — 全課金状態の現在プラン表示、価格の読み込み状態、操作導線、Storybookを所有する
- `src/components/features/Dashboard/TrialEndingCallout/` — 表示期間、JST日付、時刻境界の再評価、Callout UI、Storybookを所有する

### バックエンド（`convex/`）

- `convex/dashboard/queries.ts` — 選択店舗から検証済み組織を解決し、現在プランの最小DTOとrolling deploy用の旧通知DTOを返す
- `convex/organizationBilling/notification.ts` — メール通知と共通の7日前境界を定義する
- `convex/organizationBilling/policy.ts` — トライアル終了境界とプランstateの契約を定義する
- `convex/organizationStripe/actions.ts` — 有料プラン表示で必要になった時だけ、現在Subscriptionの保存済みPriceを認可付きで取得する

## 画面一覧

| 画面 | 役割 |
|---|---|
| シフト担当者ダッシュボード | `planStatus`から現在の課金状態を表示する。旧backendの場合だけトライアル終了前Calloutを表示し、`/manage/billing?org=<organizationId>`へ移動する |
| 組織設定 > プランと支払い | Pro・Business継続の登録状態と利用可能な契約操作を表示する |

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.dashboard.queries.getDashboardShop` | `managerQuery` | 店舗情報、業務更新可否、認可済み`planStatus`、rolling deploy用の`trialEndingNotice`を返す |

## 旧Calloutの表示ルール

- 課金stateが `trial` かつ `selectedPaidPlan` 未設定の場合だけ通知候補を返す。ProまたはBusinessの継続が登録済みなら表示しない。
- 表示期間は `[trialEndsAt - 7日, trialEndsAt)` の半開区間とする。
- `trialEndsAt` は最終利用日の翌日0:00 JSTという排他的境界なので、画面には `trialEndsAt - 1ms` の月日を表示する。
- Convex queryは現在時刻を読まず、ブラウザが開始・終了境界で表示を再評価する。
- 同じ組織の全非削除店舗で同じ通知を表示する。別組織の課金stateは、選択中店舗に対する `managerQuery` の認可境界を越えて返さない。
- 未契約のまま終了すると、データを保持した契約制限中へ移ることを案内する。Freeへの自動移行は案内しない。
- Calloutは手動で閉じられない。有料プランの継続登録またはトライアル終了という課金state・時刻の変化で自動的に消える。
- 支払い導線のcanonical URLは`/manage/billing?org=<organizationId>`とする。URL自体は課金操作の権限を与えず、契約操作は既存のサーバー認可と課金capabilityに従う。

# Dashboardお知らせ

有事の連絡やメンテナンス案内を、シフト担当者Dashboardに1件だけ表示する機能。全体、組織、店舗、組織の契約プランを表示対象にできる。管理UIは持たず、Convex Dashboard から `dashboardAnnouncements` に直接登録して運用する。

## 関連ファイル

### フロントエンド（`src/`）

- `src/components/features/Dashboard/DashboardContent/index.tsx` — 店舗登録済み/未登録のDashboardへお知らせ機能を合成する
- `src/components/features/Dashboard/DashboardAnnouncement/` — お知らせquery、対象判定、行表示、詳細Dialog、HTML sanitizer、Storybookを所有する
- `src/components/features/Dashboard/HeroSummary/index.tsx` — 店舗ヘッダー直下のお知らせ表示枠
- `src/pages/dashboard/` — `/dashboard`のURLで検証済みの組織・店舗contextをDashboardへ渡す

### バックエンド（`convex/`）

- `convex/schema.ts` — `dashboardAnnouncements` テーブル定義
- `convex/dashboard/queries.ts` — 公開中のお知らせ候補を新しい順で返すqueryと旧フロント向け互換query
- `convex/organizationBilling/policy.ts`：課金状態から告知対象用の`targetingPlan`を導出するpolicy

## 画面一覧

| 画面 | 役割 |
|---|---|
| シフト担当者ダッシュボード | 公開中のお知らせがある場合、日付とタイトルの行を表示し、押下で本文Dialogを開く |
| `/dashboard?org=<organizationId>&shop=<shopId>` | `org`と`shop`から検証済みの現在contextを使い、browser storageの店舗IDを対象判定や認可へ流用しない |
| 初回セットアップ前ダッシュボード | 店舗未登録でも、公開中の全体向けお知らせがあれば `WelcomeHero` の上に表示する |

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.dashboard.queries.getActiveDashboardAnnouncementsV2` | query | `isPublished: true` かつ `isDeleted: false` の最新候補を最大100件返す。`planIdVersion: 2`ではcanonical ID、未指定では旧フロント向けIDを返す |
| `api.dashboard.queries.getActiveDashboardAnnouncements` | query | deploy互換のため、プラン単独指定を除外して直前版フロントへ候補を返す |
| `api.dashboard.queries.getActiveDashboardAnnouncement` | query | deploy互換のため、対象指定のない最新1件だけを旧フロントへ返す |

## 登録データ

```json
{
  "organizationId": "対象組織ID1,対象組織ID2（任意）",
  "shopId": "対象店舗ID1,対象店舗ID2（任意）",
  "organizationPlan": "pro",
  "planIdVersion": 2,
  "title": "LINE通知の遅延について",
  "bodyHtml": "<p>現在、LINE通知の送信に遅延が発生しています。</p><p>復旧までメール通知をご確認ください。</p>",
  "displayDate": "2026-06-17",
  "isPublished": true,
  "isDeleted": false
}
```

## 表示ルール

- 公開条件は `isPublished: true` と `isDeleted: false` のみ。終了時は `isPublished: false` にする。
- `organizationId`、`shopId`、`organizationPlan` がすべて未設定なら全体向けとする。既存データも全体向けとして扱う。
- 対象を複数指定するときは、各フィールドへ半角カンマ区切りで入力する。単一値もそのまま入力でき、値の前後の空白と空要素は無視する。
- `organizationPlan`には`trial`、`free`、`standard`、`pro`を指定できる。大文字と小文字は区別する。
- 支払い不要Pro相当（`complimentary.pro`）は`organizationPlan: "pro"`の対象に含める。
- plan IDのWiden期間だけ、version markerのない保存済み`pro`と`business`をそれぞれStandardとProとして読み取る。新規保存ではcanonical IDと一時markerを使う。
- `organizationId`、`shopId`、`organizationPlan` のいずれか一つが選択中のコンテキストと一致すれば表示対象とする。複数フィールドを設定した場合もOR条件になる。
- 契約プランは課金policyが用途別に導出する`targetingPlan`で判定する。Trialは`trial`、期間末変更予約中は変更前プラン、支払い猶予中は猶予中のプランとして扱う。Freeから有料プランへの支払い結果待ちはFree、StandardからProへの支払い結果待ちはStandardとして扱う。旧`restricted` stateで表示対象プランを安全に確定できない場合はプラン指定に一致しない。
- フィールドを設定したのに有効な値がない場合は全体向けにせず、どの店舗にも表示しない。全体向けにする場合は3フィールド自体を未設定にする。
- 店舗をまだ選択できない初回セットアップでは、全体向けだけを表示する。
- 複数公開されている場合は、`displayDate` 降順、同日内は作成日時降順の候補から、最初に表示対象となる1件だけを表示する。対象範囲の狭さは優先度に使わない。
- queryはbounded readのため最新100件だけを返す。公開中のお知らせは100件未満に保ち、終了したお知らせは非公開にする。
- query読み込み中は何も表示しない。Dashboard全体のSkeleton表示条件には含めない。
- 対象判定はフロントの表示制御であり認可ではない。公開中の本文、対象ID、対象プランは全認証ユーザーのclientへ返るため、店舗・組織の機密情報を本文へ登録しない。
- 本文HTMLは表示前に許可タグだけへsanitizeし、`script`、inline style、event handler、iframe、画像は表示しない。
- 既読管理、予約公開、管理UIは持たない。

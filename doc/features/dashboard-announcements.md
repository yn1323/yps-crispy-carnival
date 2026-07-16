# Dashboardお知らせ

有事の連絡やメンテナンス案内を、シフト担当者Dashboardに1件だけ表示する機能。全体、事業者、店舗を表示対象にできる。管理UIは持たず、Convex Dashboard から `dashboardAnnouncements` に直接登録して運用する。

## 関連ファイル

### フロントエンド（`src/`）

- `src/components/features/Dashboard/DashboardContent/index.tsx` — 店舗登録済み/未登録のDashboardへお知らせ機能を合成する
- `src/components/features/Dashboard/DashboardAnnouncement/` — お知らせquery、対象判定、行表示、詳細Dialog、HTML sanitizer、Storybookを所有する
- `src/components/features/Dashboard/HeroSummary/index.tsx` — 店舗ヘッダー直下のお知らせ表示枠

### バックエンド（`convex/`）

- `convex/schema.ts` — `dashboardAnnouncements` テーブル定義
- `convex/dashboard/queries.ts` — 公開中のお知らせ候補を新しい順で返すqueryと旧フロント向け互換query

## 画面一覧

| 画面 | 役割 |
|---|---|
| シフト担当者ダッシュボード | 公開中のお知らせがある場合、日付とタイトルの行を表示し、押下で本文Dialogを開く |
| 初回セットアップ前ダッシュボード | 店舗未登録でも、公開中の全体向けお知らせがあれば `WelcomeHero` の上に表示する |

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.dashboard.queries.getActiveDashboardAnnouncements` | query | `isPublished: true` かつ `isDeleted: false` の最新候補を最大100件返す |
| `api.dashboard.queries.getActiveDashboardAnnouncement` | query | deploy互換のため、対象指定のない最新1件だけを旧フロントへ返す |

## 登録データ

```json
{
  "organizationId": "対象事業者ID1,対象事業者ID2（任意）",
  "shopId": "対象店舗ID1,対象店舗ID2（任意）",
  "title": "LINE通知の遅延について",
  "bodyHtml": "<p>現在、LINE通知の送信に遅延が発生しています。</p><p>復旧までメール通知をご確認ください。</p>",
  "displayDate": "2026-06-17",
  "isPublished": true,
  "isDeleted": false
}
```

## 表示ルール

- 公開条件は `isPublished: true` と `isDeleted: false` のみ。終了時は `isPublished: false` にする。
- `organizationId` と `shopId` がどちらも未設定なら全体向けとする。既存データも全体向けとして扱う。
- 対象を複数指定するときは、`organizationId` と `shopId` にそれぞれ半角カンマ区切りでIDを入力する。単一IDもそのまま入力でき、ID前後の空白と空要素は無視する。
- `organizationId` のいずれかが選択中の事業者と一致するか、`shopId` のいずれかが選択中の店舗と一致すれば表示対象とする。両方が設定されている場合も、どちらか一方の一致で対象になる。
- フィールドを設定したのに有効なIDがない場合は全体向けにせず、どの店舗にも表示しない。全体向けにする場合は両フィールド自体を未設定にする。
- 店舗をまだ選択できない初回セットアップでは、全体向けだけを表示する。
- 複数公開されている場合は、`displayDate` 降順、同日内は作成日時降順の候補から、最初に表示対象となる1件だけを表示する。対象範囲の狭さは優先度に使わない。
- queryはbounded readのため最新100件だけを返す。公開中のお知らせは100件未満に保ち、終了したお知らせは非公開にする。
- query読み込み中は何も表示しない。Dashboard全体のSkeleton表示条件には含めない。
- 対象判定はフロントの表示制御であり認可ではない。公開中の本文と対象IDは全認証ユーザーのclientへ返るため、店舗・事業者の機密情報を本文へ登録しない。
- 本文HTMLは表示前に許可タグだけへsanitizeし、`script`、inline style、event handler、iframe、画像は表示しない。
- 既読管理、予約公開、管理UIは持たない。

# Dashboardお知らせ

有事の連絡やメンテナンス案内を、シフト担当者Dashboardに全店舗共通で1件だけ表示する機能。管理UIは持たず、Convex Dashboard から `dashboardAnnouncements` に直接登録して運用する。

## 関連ファイル

### フロントエンド（`src/`）

- `src/pages/dashboard/index.tsx` — お知らせqueryを取得し、初期Skeletonには含めずDashboardへ渡す
- `src/components/features/Dashboard/DashboardContent/index.tsx` — 店舗登録済み/未登録のDashboardにお知らせを差し込む
- `src/components/features/Dashboard/DashboardAnnouncement/` — 行表示、詳細Dialog、HTML sanitizer、Storybook
- `src/components/features/Dashboard/HeroSummary/index.tsx` — 店舗ヘッダー直下のお知らせ表示枠

### バックエンド（`convex/`）

- `convex/schema.ts` — `dashboardAnnouncements` テーブル定義
- `convex/dashboard/queries.ts` — 公開中の最新お知らせを1件だけ返すquery

## 画面一覧

| 画面 | 役割 |
|---|---|
| シフト担当者ダッシュボード | 公開中のお知らせがある場合、日付とタイトルの行を表示し、押下で本文Dialogを開く |
| 初回セットアップ前ダッシュボード | 店舗未登録でも、公開中のお知らせがあれば `WelcomeHero` の上に表示する |

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.dashboard.queries.getActiveDashboardAnnouncement` | query | `isPublished: true` かつ `isDeleted: false` の最新1件を返す |

## 登録データ

```json
{
  "title": "LINE通知の遅延について",
  "bodyHtml": "<p>現在、LINE通知の送信に遅延が発生しています。</p><p>復旧までメール通知をご確認ください。</p>",
  "displayDate": "2026-06-17",
  "isPublished": true,
  "isDeleted": false
}
```

## 表示ルール

- 公開条件は `isPublished: true` と `isDeleted: false` のみ。終了時は `isPublished: false` にする。
- 複数公開されている場合は、`displayDate` 降順、同日内は作成日時降順で1件だけ表示する。
- query読み込み中は何も表示しない。Dashboard全体のSkeleton表示条件には含めない。
- 本文HTMLは表示前に許可タグだけへsanitizeし、`script`、inline style、event handler、iframe、画像は表示しない。
- 既読管理、店舗別出し分け、予約公開、管理UIはv1では持たない。

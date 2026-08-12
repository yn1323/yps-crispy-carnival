# 機能インデックス

現在のコードに実装されている機能を、利用者が完了したい仕事で分類しています。
実環境で利用できるかは、[リリース状態](../manual/release-status.md)に証跡がある項目だけを確認済みとして扱います。
画面、API、関連ファイル、保証範囲の詳細は各機能文書を参照してください。

## 利用開始、認証、法務同意

| 対象利用者 | 主な画面・利用場面 | 機能文書 |
|---|---|---|
| 管理ユーザー | ログイン、新規登録、パスワード再設定、別端末確認 | [認証画面](auth-pages.md) |
| 管理ユーザー、スタッフ | 利用規約とプライバシーポリシーの表示、同意 | [法務同意フロー](legal-consent.md) |
| 初回利用の管理ユーザー | Dashboardでの店舗登録後オンボーディング | [ログイン後オンボーディング](dashboard-onboarding.md) |
| 参加するスタッフ、承認する管理者 | 店舗参加QR・URL、参加申請、承認 | [スタッフ参加QR・承認導線](staff-registration.md) |

## 組織、店舗、人物、権限

| 対象利用者 | 主な画面・利用場面 | 機能文書 |
|---|---|---|
| 組織管理者 | 組織設定、管理者招待、店舗管理、プラン確認 | [組織課金、複数店舗、複数管理者](organization-billing.md) |
| 複数店舗の管理ユーザー | 店舗切り替えと旧店舗所属モデルの移行互換 | [店舗単位管理者所属の移行互換](manager-shop-membership.md) |
| 店舗管理者 | 店舗名、営業時間、定休日、シフト作成条件の設定 | [店舗設定](shop-settings.md) |
| 組織管理者、店舗管理者 | 人物プロフィール、店舗別スタッフ設定、権限、通知状況 | [スタッフ詳細](user-detail.md) |

## 募集、希望提出、シフト編集、確定

| 対象利用者 | 主な画面・利用場面 | 機能文書 |
|---|---|---|
| シフト担当者 | 募集の作成、一覧、削除 | [シフト募集管理](shift-recruitment-management.md) |
| シフト担当者 | シフト表の編集、保存、確定 | [シフト表](shift-board.md) |
| スタッフ | 希望シフトの入力、確認、提出、リンク再発行 | [希望シフト提出](shift-submission.md) |
| シフト担当者 | シフト提出対象から外すスタッフの管理 | [シフト対象外スタッフ](shift-exclusion.md) |
| シフト担当者 | 締切後も未確定の募集に対する催促 | [シフト確定催促リマインダー](shift-confirmation-reminder.md) |
| 店舗管理者 | 初回店舗登録後に本番募集へ戻るための案内 | [店舗登録後の本番募集リマインダー](shop-activation-reminder.md) |

## 通知、再送、LINE連携

| 対象利用者 | 主な画面・利用場面 | 機能文書 |
|---|---|---|
| スタッフ、管理ユーザー | LINE連携と通知チャネルの自動選択 | [LINE通知連携](line-notification.md) |
| システム、運用担当 | 通知の予約、送信、再試行、回復 | [通知配送outbox](notification-outbox.md) |
| 店舗管理者 | スタッフ詳細での通知履歴確認 | [スタッフ通知履歴](notification-history.md) |
| 店舗管理者 | Dashboardの不達通知一覧と再通知 | [通知不達Dashboard](notification-failure-dashboard.md) |
| 管理ユーザー | Dashboard上部のお知らせ | [Dashboardお知らせ](dashboard-announcements.md) |

## 課金、公開状態、削除

| 対象利用者 | 主な画面・利用場面 | 機能文書 |
|---|---|---|
| Trial中の組織管理者 | Dashboardの終了前案内とプラン変更導線 | [トライアル終了前Dashboard案内](trial-ending-dashboard-callout.md) |
| 組織管理者、店舗管理者 | 店舗・組織の利用停止と永続cleanup | [店舗・組織削除](data-deletion.md) |
| 所属のない管理ユーザー | 再認証を伴うアカウント削除依頼 | [所属なしユーザーのアカウント削除](account-deletion.md) |

実環境での公開状態、deployment、migrationは[リリース状態](../manual/release-status.md)を参照してください。

## 公開サイト、ヘルプ、問い合わせ

| 対象利用者 | 主な画面・利用場面 | 機能文書 |
|---|---|---|
| 未ログインを含む利用者 | TOP、FAQ、記事、デモ、法務ページなどの公開導線 | [公開サイト](public-pages.md) |
| シフト担当者、スタッフ | 操作手順とトラブル対応のHowTo | [使い方・ヘルプ](howto.md) |
| 未ログインを含む利用者 | 問い合わせフォーム | [問い合わせ](contact.md) |
| 同意した公開サイト利用者、開発・運用担当 | 公開routeの導線とWeb Vitals | [公開サイトのWeb計測](web-measurement.md) |
| ログイン中の管理ユーザー、運用担当 | 要望の投稿と内部分析画面での確認 | [要望受付](feature-requests.md) |

## 内部分析

| 対象利用者 | 主な画面・利用場面 | 機能文書 |
|---|---|---|
| 開発・運用担当 | source event、分析projection、cycle fact、日次snapshotの運用 | [分析KPI蓄積基盤](analytics.md) |
| 内部BIの閲覧者 | 全体から組織、店舗、cycleへ掘り下げる分離Dashboard | [分析KPI可視化アプリ](analytics-dashboard.md) |

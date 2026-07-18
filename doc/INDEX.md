# 機能インデックス

このドキュメントは、各機能の概要ドキュメントへのインデックスです。詳細な仕様はコードを参照します。

## 業務仕様

| 仕様 | 概要 | 状況 |
|---|---|---|
| [グループ課金、複数店舗、複数管理者の業務フロー](specs/organization-billing-business-flow.md) | グループ単位の契約、利用人数、無料体験、Free移行、支払い失敗、通知、管理者招待の業務基準 | 業務方針確定、料金とStripe連携は外部ゲート |

## 機能一覧

| 機能 | 概要 | 実装状況 |
|---|---|---|
| [認証画面](features/auth-pages.md) | Clerk認証を利用したログイン・新規登録・パスワード再設定の自作UI | 実装済 |
| [法務同意フロー](features/legal-consent.md) | 管理ユーザー/スタッフ向け利用規約・プライバシーポリシー同意を記録 | 実装済 |
| [LINE通知連携](features/line-notification.md) | スタッフ向け通知をLINE Push / メールで自動振り分け（設定UIなし） | 実装済 |
| [通知配送outbox](features/notification-outbox.md) | LINE / メール通知を予約し、少量ずつ配送・再試行するバックエンドキュー | 実装済 |
| [通知不達Dashboard](features/notification-failure-dashboard.md) | 送信できなかった通知をDashboardで確認し、個別/一斉に再通知を受け付ける導線 | 実装済 |
| [Dashboardお知らせ](features/dashboard-announcements.md) | 有事のお知らせを全体・グループ・店舗の対象別にDashboard上部へ1件表示 | 実装済 |
| [グループ課金、複数店舗、複数管理者](features/organization-billing.md) | グループ単位の課金状態、人物、管理者招待、店舗管理、店舗切り替え、移行互換 | ローカル実装済、外部ゲートを除く |
| [店舗・グループ削除](features/data-deletion.md) | 論理削除、主要マスタの直接識別子置換、Capability失効、永続cleanupの保証範囲 | 実装済、本番migration未実行 |
| [スタッフ参加QR・承認導線](features/staff-registration.md) | 店舗専用QR/URLからスタッフ本人が参加申請し、シフト担当者が承認する導線 | 実装済 |
| [店舗設定](features/shop-settings.md) | 店舗名、シフト時間帯、定休日などシフト作成の前提になる店舗情報を管理 | 実装済 |
| [ログイン後オンボーディング](features/dashboard-onboarding.md) | 店舗登録後にシフト担当者自身で募集作成・通知確認・提出確認を試すDashboard内Callout | 実装済 |
| [店舗登録後の本番募集リマインダー](features/shop-activation-reminder.md) | 初回店舗登録から7日後17:00 JSTに、本番募集作成の再開きっかけをactive managerへ送る補助通知 | 実装済 |
| [シフト募集管理](features/shift-recruitment-management.md) | シフト担当者がシフト募集を作成・確認・削除する管理導線 | 実装済 |
| [希望シフト提出](features/shift-submission.md) | スタッフの希望提出と前回シフトあり週パターンの再利用 | 実装済 |
| [シフト対象外スタッフ](features/shift-exclusion.md) | 店舗共通アドレス等シフトを出さないスタッフを表示・シフト関連通知の対象から外す | 実装済 |
| [シフト確定催促リマインダー](features/shift-confirmation-reminder.md) | 締切翌日17時に未確定の募集があれば店舗マネージャー全員へ確定を催促（失敗は要対応Inbox対象外） | 実装済 |
| [公開サブページ](features/public-pages.md) | LPコンテンツを流用した、できること・FAQ・デモへの公開導線 | 実装済 |
| [使い方・ヘルプ](features/howto.md) | 操作方法、通知の仕組み、困ったときの対処方法をMDXで管理する公開ヘルプ | 実装済 |
| [問い合わせ](features/contact.md) | 公開フォームから問い合わせメールを送り、成功後にSlackへ社内通知 | 実装済 |
| [要望受付](features/feature-requests.md) | ログイン後の要望DialogでDBへ保存し、分析画面で新しい順に確認 | 実装済 |
| [分析KPI蓄積基盤](features/analytics.md) | サービス利用状況KPIを日次cronで蓄積し時系列分析できるようにするinternal専用基盤 | 実装済 |
| [分析KPI可視化アプリ](features/analytics-dashboard.md) | 蓄積済みKPIを本人用の内部BIとしてCloudflare Pages別アプリで可視化 | 実装済 |

## 旧検討資料

- [店舗単位課金プランの旧検討](features/billing-plans.md)
- [店舗単位の請求管理者ロールに関する旧検討](features/manager-billing-roles.md)
- [店舗単位管理者所属の移行互換](features/manager-shop-membership.md)

## 関連ドキュメント

- [ARCHITECTURE.md](ARCHITECTURE.md) - 全体構造、機能マッピング、データフロー
- [rules/frontend-architecture.md](rules/frontend-architecture.md) - フロントエンドのディレクトリ、依存方向、ファイル責務
- [rules/convex-design-strategy.md](rules/convex-design-strategy.md) - Convexの認証境界、公開API、Capability、durable workflow、データ保持、運用契約
- [rules/security-strategy.md](rules/security-strategy.md) - セキュリティ設計、認証/認可境界、token/通知/billingレビュー方針
- [rules/testing-strategy.md](rules/testing-strategy.md) - テスト種別、テスト層の分担、Convex Function TestとScenario Testの方針

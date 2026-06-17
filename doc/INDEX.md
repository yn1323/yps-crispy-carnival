# 機能インデックス

このドキュメントは、各機能の概要ドキュメントへのインデックスです。詳細な仕様はコードを参照します。

## 機能一覧

| 機能 | 概要 | 実装状況 |
|---|---|---|
| [認証画面](features/auth-pages.md) | Clerk認証を利用したログイン・新規登録・パスワード再設定の自作UI | 実装済 |
| [法務同意フロー](features/legal-consent.md) | 管理ユーザー/スタッフ向け利用規約・プライバシーポリシー同意を記録 | 実装済 |
| [LINE通知連携](features/line-notification.md) | スタッフ向け通知をLINE Push / メールで自動振り分け（設定UIなし） | 実装済 |
| [通知配送outbox](features/notification-outbox.md) | LINE / メール通知を予約し、少量ずつ配送・再試行するバックエンドキュー | 実装済 |
| [Dashboardお知らせ](features/dashboard-announcements.md) | 有事の全店舗共通お知らせをDashboard上部に1件だけ表示 | 実装済 |
| [管理ユーザーと店舗所属](features/manager-shop-membership.md) | 管理ユーザーと店舗を `shopMembers` で結ぶ所属モデル。複数店舗対応のDB土台 | 準備中 |
| [スタッフ参加QR・承認導線](features/staff-registration.md) | 店舗専用QR/URLからスタッフ本人が参加申請し、シフト担当者が承認する導線 | 実装済 |
| [店舗設定](features/shop-settings.md) | 店舗名、シフト時間帯、定休日などシフト作成の前提になる店舗情報を管理 | 実装済 |
| [ログイン後オンボーディング](features/dashboard-onboarding.md) | 店舗登録後にシフト担当者自身で募集作成・通知確認・提出確認を試すDashboard内Callout | 実装済 |
| [シフト募集管理](features/shift-recruitment-management.md) | シフト担当者がシフト募集を作成・確認・削除する管理導線 | 実装済 |
| [希望シフト提出](features/shift-submission.md) | スタッフの希望提出と前回シフトあり週パターンの再利用 | 実装済 |
| [公開サブページ](features/public-pages.md) | LPコンテンツを流用した、できること・FAQ・デモへの公開導線 | 実装済 |

## 関連ドキュメント

- [ARCHITECTURE.md](ARCHITECTURE.md) - 全体構造、機能マッピング、データフロー

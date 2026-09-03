# 問い合わせ

未ログインを含む利用者が、シフトリ内の公開フォームから利用開始、機能や使い方、不具合などの問い合わせを送る機能。

問い合わせメールをResendで受け付けた後、同じ送信処理からSlackへ社内通知する。

## 関連ファイル

- `src/routes/contact.tsx`
- `src/pages/contact/index.tsx`
- `src/components/features/ContactForm/`
- `src/components/templates/PublicPageLayout/`
- `convex/contact/schemas.ts`
- `convex/contact/mutations.ts`
- `convex/contact/httpActions.ts`
- `convex/contact/actions.ts`
- `convex/http.ts`
- `convex/_lib/rateLimits.ts`
- `convex/_lib/notificationDelivery.ts`

## 画面一覧

| 画面 | パス | 用途 |
|---|---|---|
| 問い合わせ | `/contact` | 問い合わせ種別、氏名、メールアドレス、店舗名または会社名、問い合わせ内容を送信する |

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `/contact/submit` | Convex HTTP action | V8 runtimeでOrigin、入力、Turnstile、送信頻度を検証する |
| `contact/actions:deliver` | internal action | Node.js runtimeでResend送信後にSlackへ通知する |
| `contact/mutations:checkTurnstileRateLimit` | internal mutation | Siteverify前に固定global budgetで検証要求の集中を止める |
| `contact/mutations:checkSubmissionRateLimit` | internal mutation | Turnstile通過後、メールアドレスと送信元IPのhashで送信頻度を制限する |

## 送信順序

```text
問い合わせフォーム
  -> Turnstile Siteverify
  -> レート制限
  -> Resend
  -> Slack Incoming Webhook
```

メールを問い合わせの正とする。

Slack通知だけが失敗した場合も、メールの送信受付が成功していれば利用者には受付完了を表示する。

問い合わせ本文は初期版ではDBへ保存しない。

## 環境変数

- `VITE_TURNSTILE_SITE_KEY`
- `VITE_CONVEX_SITE_URL`（未設定時は `VITE_CONVEX_URL` から導出）
- `TURNSTILE_SECRET_KEY`
- `CONTACT_RECIPIENT_EMAIL`
- `SLACK_CONTACT_WEBHOOK_URL`
- `CONTACT_ALLOWED_ORIGINS`（追加Originをカンマ区切りで指定）
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## セキュリティ境界

- Turnstile tokenはサーバー側のSiteverifyで検証し、`contact` actionと許可Originのhostnameが一致する場合だけ受け付ける。
- Cloudflare公式のalways-passテストキーは、localhostからの開発時だけテスト用hostnameを許可する。
- HTTP actionは明示したOriginだけを許可する。
- HTTP actionは本文をUTF-8換算16 KiB以下に制限し、超過時はTurnstile検証や外部送信の前に拒否する。
- `DEBUG_MODE=true`かつ`DEBUG_NOTIFICATION_DELIVERY_MODE=dry-run`の場合は、ResendとSlackの外部配送を抑止する。`force-failure`の場合も外部配送せず、問い合わせの配送失敗を再現する。設定方法は[デバッグ環境変数の運用](../manual/debug-mode.md)を参照する。
- 氏名、メールアドレス、問い合わせ本文、Turnstile token、Slack Webhook URLをログへ出さない。
- Slackのmrkdwnに埋め込む利用者入力はエスケープし、意図しないメンションを防ぐ。
- レート制限キーにはメールアドレスやIPの生値ではなくSHA-256 hashを使う。

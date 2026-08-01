# 認証画面

## 機能説明

管理ユーザー向けのログイン、新規登録、パスワード再設定をシフトリ独自UIで提供する。認証基盤はClerkのまま維持し、Google認証とメールアドレス/パスワード認証を扱う。

別の端末やブラウザからパスワードでログインし、ClerkのClient Trustが追加確認を要求した場合は、登録メールアドレスへ確認コードを送り、シフトリ内で本人確認を完了する。

## 関連ファイルパス

- `src/routes/login.tsx`
- `src/routes/signup.tsx`
- `src/routes/forgot-password.tsx`
- `src/routes/sso-callback.tsx`
- `src/pages/auth/index.tsx`
- `src/pages/auth/meta.ts`
- `src/components/features/AuthPage/index.tsx`：認証済み判定とログイン、新規登録、パスワード再設定のflow選択
- `src/components/features/AuthPage/LoginFlow/`：パスワードログインとClient Trust本人確認のcontroller/View
- `src/components/features/AuthPage/SignupFlow/`：メール確認を含む新規登録のcontroller/View
- `src/components/features/AuthPage/ForgotPasswordFlow/`：再設定コード送信とパスワード変更のcontroller/View
- `src/components/features/AuthPage/SsoCallback/`：Google OAuth callbackのcontroller
- `src/components/features/AuthPage/*Form/`：ログイン、本人確認、新規登録、パスワード再設定のViewと固有schema
- `src/components/features/AuthPage/useGoogleOAuthController.ts`：Google OAuthとLINE外部ブラウザ遷移の共通controller hook
- `src/components/features/AuthPage/completeAuthSession.ts`：Clerk sessionの有効化と正規化済みURLへの遷移
- `src/components/features/AuthPage/script.ts`：LINEアプリ内ブラウザ判定
- `src/components/features/AuthPage/loginVerification.ts`：Client Trustの判定、メール確認factorの選択、表示用メールアドレスのマスク
- `src/components/features/AuthPage/loginVerification.test.ts`
- `convex/_lib/lineUrl.ts` — `openExternalBrowser=1` 付与（フロントと共有）

## LINEアプリ内ブラウザ対応

LINEアプリ内ブラウザ（WebView）ではGoogle OAuthがGoogle側でブロックされる（403: disallowed_useragent）。ログイン/新規登録画面ではUAでLINE内ブラウザを検出し、注意バナーを表示したうえで、Googleボタン押下時に `openExternalBrowser=1` 付きURLへ遷移して外部ブラウザで開き直す。メール/パスワード認証はLINE内ブラウザでもそのまま利用できる。

## 別端末ログインの本人確認

パスワードログインの結果がClient Trustの追加確認を示し、Clerkが`email_code`を提供した場合は、`prepareSecondFactor()`で確認コードを送る。

利用者がコードを入力したら、`attemptSecondFactor()`で照合する。

Clerkが`complete`とセッションIDを返した場合だけセッションを有効化する。

現在のClerk SDKでは、Client Trustが旧形式の`needs_second_factor`として返る場合がある。

Clerk側の更新状態によって`needs_client_trust`が返る場合もあるため、両方のステータスと`email_code`の組み合わせを同じ本人確認フローとして扱う。

信頼済み端末の状態はシフトリのDBやlocalStorageへ保存せず、Clerkの判定を正とする。

Cookieの削除、シークレットブラウザ、別ブラウザ、信頼期間の終了などでClerkが新しい端末相当と判断した場合は、同じ端末でも本人確認を再度要求する。

## 画面一覧

- `/login` — ログイン画面
- `/signup` — 新規登録画面
- `/forgot-password` — パスワード再設定画面
- `/sso-callback` — Google認証後のコールバック画面

## API一覧

- Clerk `useSignIn()` — メール/パスワードログイン、Googleログイン、パスワード再設定
- Clerk `SignIn.prepareSecondFactor()` — 別端末ログイン用のメール確認コード送信
- Clerk `SignIn.attemptSecondFactor()` — 別端末ログイン用のメール確認コード照合
- Clerk `useSignUp()` — メール/パスワード登録、Google登録、メール確認
- Clerk `useClerk().handleRedirectCallback()` — OAuthコールバック処理

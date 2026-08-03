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
- `src/components/features/AccountEmailChange/`：ログインメールの所有確認、primary変更、Convex同期、旧メール削除
- `src/components/features/AuthenticatedApp/AuthGuard.tsx`：Clerk primaryとConvexの不一致検出
- `src/components/features/AuthenticatedApp/AccountEmailMismatchRecovery.tsx`：既存不一致を本人の選択で復旧する画面
- `src/components/features/UserMenu/index.tsx`：DashboardヘッダーへClerk primaryを表示
- `convex/accountEmail/`：Clerk verified primaryのserver-side確認と全所属への同期
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

## ログインメールの変更

アカウント連携済みユーザーでは、Clerkのverified primary emailをログインメールの正本とする。  Convexの`users`、有効な`organizationPeople`、未削除`staffs`には、ログインと業務連絡に共通で使う同じ値を複製する。

変更できるのはログイン中の本人だけである。  同じClerk Userへ新しいメールアドレスを追加し、新メールへ届く確認コードで所有を確認した後、Clerkのreverificationを経てprimaryへ変更する。  現在のClerk Userを削除したり、別のClerk Userを作成したりしない。

primary変更後は、browserからメール文字列や対象user IDを渡さず、Convex actionが認証identityと同じClerk Userのverified primaryをBackend APIで再取得する。  `users`と本人の全所属を一transactionで同期できた後にだけ、以前のClerk EmailAddressを削除する。

同期や旧メール削除に失敗した場合は成功画面へ進めず、同期の再試行または以前のprimaryへ戻す操作を表示する。  ロールバック時も、Clerkを以前のprimaryへ戻した後にConvexを再同期してから追加メールを削除する。

YahooメールなどからGmailへ変更した場合、既存のパスワードを持つユーザーは、変更完了後に新しいGmailアドレスと同じパスワードで通常のメールログインを利用できる。  この変更はGoogle OAuthのexternal accountを自動作成・連携しないため、Googleボタンでのログイン可否は別の連携状態に従う。

DashboardヘッダーはConvexの複製値へfallbackせず、Clerk primaryを表示する。

## ClerkとConvexの不一致復旧

ログイン後にClerk verified primaryと`users.email`が異なる場合は、通常画面より先に復旧画面を表示する。  どちらかを自動採用せず、本人が次のいずれかを選ぶ。

1. シフトリに登録済みのメールを、Clerkのログインメールにも使う。
2. 現在のClerkログインメールを、シフトリの全所属へ反映する。

一つ目は通常のメール変更と同じ新メール確認とreverificationを行う。  二つ目もbrowserの表示値を同期せず、serverがClerk verified primaryを取得する。  メール変更処理中の一時的な不一致では進行中Dialogを維持し、再読み込みなどで処理が中断された場合は復旧画面へ戻す。

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
- Clerk `User.createEmailAddress()`、`EmailAddress.prepareVerification()`、`EmailAddress.attemptVerification()` — 新しいログインメールの追加と所有確認
- Clerk `User.update()`と`useReverification()` — verified emailのprimary化と本人再確認
- Clerk `EmailAddress.destroy()` — Convex同期後の以前のメール削除
- `api.accountEmail.actions.syncMyPrimaryEmail` — 認証中のClerk verified primaryをConvexの全所属へ同期

# 認証画面

## 機能説明

管理ユーザー向けのログイン、新規登録、パスワード再設定をシフトリ独自UIで提供する。認証基盤はClerkのまま維持し、Google認証とメールアドレス/パスワード認証を扱う。

## 関連ファイルパス

- `src/routes/login.tsx`
- `src/routes/signup.tsx`
- `src/routes/forgot-password.tsx`
- `src/routes/sso-callback.tsx`
- `src/pages/auth/index.tsx`
- `src/components/features/AuthPage/index.tsx`

## 画面一覧

- `/login` — ログイン画面
- `/signup` — 新規登録画面
- `/forgot-password` — パスワード再設定画面
- `/sso-callback` — Google認証後のコールバック画面

## API一覧

- Clerk `useSignIn()` — メール/パスワードログイン、Googleログイン、パスワード再設定
- Clerk `useSignUp()` — メール/パスワード登録、Google登録、メール確認
- Clerk `useClerk().handleRedirectCallback()` — OAuthコールバック処理

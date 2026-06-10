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
- `src/utils/inAppBrowser.ts` — LINEアプリ内ブラウザ判定
- `convex/_lib/lineUrl.ts` — `openExternalBrowser=1` 付与（フロントと共有）

## LINEアプリ内ブラウザ対応

LINEアプリ内ブラウザ（WebView）ではGoogle OAuthがGoogle側でブロックされる（403: disallowed_useragent）。ログイン/新規登録画面ではUAでLINE内ブラウザを検出し、注意バナーを表示したうえで、Googleボタン押下時に `openExternalBrowser=1` 付きURLへ遷移して外部ブラウザで開き直す。メール/パスワード認証はLINE内ブラウザでもそのまま利用できる。

## 画面一覧

- `/login` — ログイン画面
- `/signup` — 新規登録画面
- `/forgot-password` — パスワード再設定画面
- `/sso-callback` — Google認証後のコールバック画面

## API一覧

- Clerk `useSignIn()` — メール/パスワードログイン、Googleログイン、パスワード再設定
- Clerk `useSignUp()` — メール/パスワード登録、Google登録、メール確認
- Clerk `useClerk().handleRedirectCallback()` — OAuthコールバック処理

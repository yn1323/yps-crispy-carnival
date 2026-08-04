# 認証画面とログイン設定

## 機能説明

管理ユーザー向けのログイン、新規登録、パスワード再設定と、認証済み利用者向けのログイン設定をシフトリ独自UIで提供する。  認証基盤はClerkを正本とし、Google認証とメールアドレス・パスワード認証を扱う。

Clerk UserのEmailAddress、パスワード、ExternalAccountは「シフトリへ入る方法」であり、グループ単位のシフト連絡先とは独立している。  ログイン方法を変更しても`organizationPeople.email`、`staffs.email`、`organizations.billingEmail`は変更しない。シフト連絡先を変更してもClerkのログイン方法は変更しない。

`users.email`は新規user作成時のbootstrap snapshotとlegacy fallbackであり、Clerkの現在値やシフト連絡先を同期する正本ではない。  Clerk、`users`、各グループの`organizationPeople`でメールが異なる状態を正常として扱う。

## 関連ファイルパス

- `src/routes/login.tsx`
- `src/routes/signup.tsx`
- `src/routes/forgot-password.tsx`
- `src/routes/sso-callback.tsx`
- `src/routes/_auth/account.security.tsx`
- `src/pages/auth/`：公開認証ページの組み立てとmetadata
- `src/pages/account-security/`：本人専用のログイン設定ページ
- `src/components/features/AuthPage/`：ログイン、新規登録、パスワード再設定、Google OAuth、Client Trust本人確認
- `src/components/features/LoginMethods/`：Clerk resourceからの状態導出、Googleとメール・パスワードの表示、操作能力ごとの安全gate
- `src/components/features/ManagerInvitationAcceptance/`：管理者招待の受諾と、必要な場合の招待先メール所有確認
- `src/components/features/AuthenticatedApp/AuthGuard.tsx`：認証、削除済みアカウント、店舗context要否の境界
- `src/components/features/UserMenu/index.tsx`：全認証済み利用者が使える「ログイン設定」への導線
- `convex/organizationInvitation/acceptanceActions.ts`：Clerk verified EmailAddressをserver-sideで確認する管理者招待受諾action
- `convex/_lib/clerkVerifiedEmailProvider.ts`：Clerk instanceとverified EmailAddress一覧の検証境界
- `convex/accountEmail/`：旧clientを安全側へ停止させるrolling release互換stub
- `convex/_lib/lineUrl.ts`：LINE外部ブラウザ用の`openExternalBrowser=1`付与

## ログインと新規登録

ログイン画面は「Googleでログイン」と「メールアドレスとパスワードでログイン」の2つの方法として表示する。  フォームでは「ログインに使うメールアドレス」と案内し、グループのシフト連絡先を入力する画面とは混同させない。

新規登録もGoogleまたはメールアドレスとパスワードで行う。  ここで登録するメールはClerkのログイン方法であり、ログイン後の初回セットアップでシフト連絡先の候補値として使われるだけである。初回セットアップ後に両者を自動同期しない。

パスワード再設定は、Clerkにログイン方法として登録済みのメールアドレスを対象にする。

## LINEアプリ内ブラウザ対応

LINEアプリ内ブラウザではGoogle OAuthがprovider側で拒否される場合がある。  ログイン・新規登録画面ではLINE内ブラウザを検出して注意を表示し、Googleボタン押下時は`openExternalBrowser=1`付きURLへ遷移して外部ブラウザで開き直す。メールアドレス・パスワード認証はLINE内ブラウザでもそのまま利用できる。

## 別端末ログインの本人確認

パスワードログインの結果がClient Trustの追加確認を示し、Clerkが`email_code`を提供した場合は、`prepareSecondFactor()`で確認コードを送る。  利用者がコードを入力したら`attemptSecondFactor()`で照合し、Clerkが`complete`とsession IDを返した場合だけsessionを有効にする。

現在のClerk SDKが返し得る`needs_second_factor`と`needs_client_trust`の両方を、`email_code`が利用できる場合に同じ本人確認フローとして扱う。

信頼済み端末の状態はシフトリのDBやlocalStorageへ保存せず、Clerkの判定を正とする。  Cookie削除、シークレットブラウザ、別ブラウザ、信頼期間の終了などでClerkが新しい端末相当と判断した場合は、同じ端末でも本人確認を再度要求する。

## ログイン設定

認証済み利用者は、ヘッダー右上のユーザーメニューから`/account/security`を開く。  メニュー名は「ログイン設定」、ページ見出しは「ログイン方法とセキュリティ」とする。ヘッダーにClerk primary emailは表示しない。

このページはグループや店舗に依存しない本人専用画面である。  `?shop=`を引き継がず、店舗一覧取得、selected shop解決、無効店舗による全体blockを行わない。認証、削除済みアカウント判定などの共通契約だけを維持する。

画面はClerkのcurrent User resourceから、次をカード単位で表示する。

- Google ExternalAccountの接続状態とマスク済みメール
- verified、unverified、Google linkedを含むEmailAddressの状態
- パスワードの設定有無
- resourceを安全に判定できない場合の局所errorと再読み込み

Clerk内部のprimary・secondaryという用語は製品UIに出さない。  一つの操作の失敗で認証後アプリ全体を止めず、Googleカードまたはメール・パスワードカード内で収束させる。

## Clerk操作の公開gate

ログイン方法を失う操作を、UIだけの推測で公開しない。  次の操作は独立したcapabilityで管理し、対象Clerk instanceと現在固定しているSDKで成立性を確認した操作だけを有効にする。

- Google連携と再接続
- Google解除
- メールアドレスとパスワードの設定
- パスワード変更と削除
- EmailAddress削除

現在は`ENV-CLERK-02`が未検証のため、`LoginMethods`の変更capabilityをすべて無効にし、状態確認と再読み込みだけを公開する。  これは途中releaseを安全に保つための縮退であり、ログイン方法の変更機能が完成したことを意味しない。

将来capabilityを有効にする場合も、操作直前に`user.reload()`してresource IDを再解決し、`useReverification()`とClerk serverの拒否を安全条件にする。  linked email、primary email、最後のログイン方法は、実環境で削除可否と競合時の挙動を確認できるまで削除操作を出さない。

Google account linkingのOAuth帰還先は`/account/security`専用とし、サインイン・サインアップ完了用の`/sso-callback`と混同しない。

## 管理者招待のメール所有確認

管理者招待の受諾は、招待先をClerk primary emailとみなさない。

- すでにpersonとClerk Userが接続済みの場合は、現在の内部`userId`との一致で本人を確認する。
- 未接続personまたは外部招待の場合は、招待先が現在のClerk Userのverified EmailAddressに含まれることをConvex Node actionからClerk Backend APIで確認する。

現在のClerk Userに招待先のverified EmailAddressがない場合だけ、利用者へ招待メールの宛先を明示入力してもらい、同じEmailAddress resourceを再利用または追加して`email_code`で所有確認する。  確認後は招待tokenだけで受諾actionを再実行し、入力メールや確認コードをConvex、storage、log、auditへ渡さない。

招待の所有確認でClerkへ追加したEmailAddressは、シフト連絡先の自動同期ではない。  personの既存連絡先、`users.email`、請求先を上書きせず、ログインに使えるかどうかもClerkの実際の設定に従う。

## 既存のメール差異と旧同期機能

次のような既存状態は修復対象ではなく正常である。

```text
Googleログイン: Gmail
シフト連絡先: Yahoo
ClerkのEmailAddress: 1件または複数件
```

`AuthGuard`はClerk primary emailと`users.email`の一致を要求せず、メール差異や旧メール削除失敗で通常画面をblockしない。  旧`account-email-cleanup-session`は再実行せず削除し、旧`?panel=email`は通常のユーザー詳細へ静かに収束させる。

旧`convex/accountEmail/`のpublic APIはrolling release互換のため一時的に残すが、Clerk、`users`、person、staffを変更しないfail-closed stubである。  旧clientの収束を本番監視で確認した後、別のNarrowで互換APIを削除する。

## 画面一覧

- `/login`：ログイン
- `/signup`：新規登録
- `/forgot-password`：パスワード再設定
- `/sso-callback`：サインイン・サインアップ用Google OAuth callback
- `/account/security`：店舗非依存の本人用ログイン設定
- `/manager-invite`：管理者招待の確認、受諾、必要なメール所有確認

## 主なAPI

- Clerk `useSignIn()`：メール・パスワードログイン、Googleログイン、パスワード再設定
- Clerk `SignIn.prepareSecondFactor()` / `attemptSecondFactor()`：別端末ログインのメール確認
- Clerk `useSignUp()`：メール・パスワード登録、Google登録、メール確認
- Clerk `useClerk().handleRedirectCallback()`：サインイン・サインアップのOAuth callback
- Clerk `useUser()`：本人のログイン方法resource取得
- Clerk `User.createEmailAddress()`、`EmailAddress.prepareVerification()`、`EmailAddress.attemptVerification()`：招待先などのメール所有確認
- Clerk `useReverification()`：sensitiveな本人操作の追加確認
- `api.organizationInvitation.acceptanceActions.accept`：管理者招待の新しい受諾入口
- `api.accountEmail.actions.syncMyPrimaryEmail`：旧clientを変更なしで停止させる互換stub

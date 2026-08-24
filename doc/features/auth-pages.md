# 認証画面とアカウント設定

## 機能説明

管理ユーザー向けのログイン、新規登録、パスワード再設定と、認証済み利用者向けのアカウント設定をシフトリ独自UIで提供する。  認証基盤はClerkを正本とし、Google認証とメールアドレス・パスワード認証を扱う。

Clerk UserのEmailAddress、パスワード、ExternalAccountは「シフトリへ入る方法」であり、組織単位のシフト連絡先とは独立している。  ログイン方法を変更しても`organizationPeople.email`、`staffs.email`、`organizations.billingEmail`は変更しない。シフト連絡先を変更してもClerkのログイン方法は変更しない。

`users.email`は新規user作成時のbootstrap snapshotとlegacy fallbackであり、Clerkの現在値やシフト連絡先を同期する正本ではない。  Clerk、`users`、各組織の`organizationPeople`でメールが異なる状態を正常として扱う。

## 関連ファイルパス

- `src/routes/login.tsx`
- `src/routes/signup.tsx`
- `src/routes/forgot-password.tsx`
- `src/routes/sso-callback.tsx`
- `src/routes/_auth/account.tsx`
- `src/pages/auth/`：公開認証ページの組み立てとmetadata
- `src/pages/account-security/`：本人専用のアカウント設定ページ
- `src/components/features/AuthPage/`：ログイン、新規登録、パスワード再設定、Google OAuth、Client Trust本人確認
- `src/components/features/LoginMethods/`：Clerk resourceからの3状態導出、Googleとメール・パスワードの表示、安全な追加・変更・解除
- `src/components/features/ManagerInvitationAcceptance/`：管理者招待の受諾と、必要な場合の招待先メール所有確認
- `src/components/features/AuthenticatedApp/AuthGuard.tsx`：認証、削除済みアカウント、店舗context要否の境界
- `src/components/features/UserMenu/index.tsx`：全認証済み利用者が使える「アカウント設定」への導線
- `convex/organizationInvitation/acceptanceActions.ts`：Clerk verified EmailAddressをserver-sideで確認する管理者招待受諾action
- `convex/_lib/clerkVerifiedEmailProvider.ts`：Clerk instanceとverified EmailAddress一覧の検証境界
- `convex/accountEmail/`：旧clientを安全側へ停止させるrolling release互換stub
- `convex/_lib/lineUrl.ts`：LINE外部ブラウザ用の`openExternalBrowser=1`付与

## ログインと新規登録

ログイン画面は「Googleでログイン」と「メールアドレスとパスワードでログイン」の2つの方法として表示する。  フォームでは「ログインに使うメールアドレス」と案内し、組織のシフト連絡先を入力する画面とは混同させない。

新規登録もGoogleまたはメールアドレスとパスワードで行う。  ここで登録するメールはClerkのログイン方法であり、ログイン後の初回セットアップでシフト連絡先の候補値として使われるだけである。初回セットアップ後に両者を自動同期しない。

パスワード再設定は、Clerkにログイン方法として登録済みのメールアドレスを対象にする。

Clerkが認証継続先を選ぶ場合も、`ClerkProvider`に設定したシフトリの`/login`と`/signup`を使う。  flow固有の遷移先を失った場合のfallbackは`/dashboard`とし、個別の`redirect`を上書きするforce redirectは使わない。

Google認証の開始は、利用者がGoogleボタンを押した時だけ、ローカルに残るsign-inとsign-upのattemptを両方resetしてから行う。  resetとOAuth開始は一つのsingle-flightに含め、どちらかのresetに失敗した場合はOAuthを開始しない。callbackのmount、BFCacheからの復帰、URL queryだけを契機にattemptをresetしない。ブラウザバックでOAuth開始のUI latchだけが残った場合は、attemptには触れずlatchを解放し、次の明示操作で再開始できるようにする。

`/sso-callback`はClerk既製の`SignIn`または`SignUp`を表示しない。  処理中はspinner、案内文、Clerk CAPTCHAを同じ一列の画面フロー内へ一度だけ描画し、モバイルでも固定配置を重ねない。CAPTCHAはClerk attemptの処理に必要な状態だけで表示し、Client Trustの本人確認画面と回復画面では表示しない。  `complete`かつ作成済みsession IDを確認できる場合だけsessionを有効にし、transferと既存sessionはClerk resourceの状態に従って処理する。Client Trustでメールコードfactorを確認できる場合は、シフトリの本人確認画面で同じattemptを継続する。メールコード以外のMFA、新しいパスワード、Protect、未対応の追加必須項目、未知の状態はsession化せず、シフトリの回復画面で停止する。回復画面から利用者が明示的にやり直す場合だけ両attemptをresetし、保持した安全な`redirect`を付けて`/login`または`/signup`へ履歴を置換する。

## LINEアプリ内ブラウザ対応

LINEアプリ内ブラウザではGoogle OAuthがprovider側で拒否される場合がある。  ログイン・新規登録画面ではLINE内ブラウザを検出して注意を表示し、Googleボタン押下時は`openExternalBrowser=1`付きURLへ遷移して外部ブラウザで開き直す。メールアドレス・パスワード認証はLINE内ブラウザでもそのまま利用できる。

## 別端末ログインの本人確認

パスワードログインまたはGoogle callbackの結果がClient Trustの追加確認を示し、Clerkが`email_code`を提供した場合は、`mfa.sendEmailCode()`で確認コードを送る。  利用者がコードを入力したら`mfa.verifyEmailCode()`で照合し、Clerkが`complete`とsession IDを返した場合だけsessionを有効にする。

現在のClerk SDKが返し得る`needs_second_factor`と`needs_client_trust`の両方を、`email_code`が利用できる場合に同じ本人確認フローとして扱う。

信頼済み端末の状態はシフトリのDBやlocalStorageへ保存せず、Clerkの判定を正とする。  Cookie削除、シークレットブラウザ、別ブラウザ、信頼期間の終了などでClerkが新しい端末相当と判断した場合は、同じ端末でも本人確認を再度要求する。

## アカウント設定

認証済み利用者は、ヘッダー右上のユーザーメニューから`/account`を開く。  メニュー名とページ見出しは「アカウント設定」とする。  ページ見出しの戻る操作では、ブラウザ履歴を1件戻す。  ヘッダーにClerk primary emailは表示しない。

`/account`は認証済みアプリshell内のcanonical URLである。
重複していた`/app/account`は削除し、互換redirectを設けない。
Google account linkingの帰還先も`/account?flow=connect-google&oauth=google`だけを使う。

このページは組織や店舗に依存しない本人専用画面である。  `?shop=`を引き継がず、店舗一覧取得、selected shop解決、無効店舗による全体blockを行わない。認証、削除済みアカウント判定などの共通契約だけを維持する。

画面はClerkのcurrent User resourceからメールアドレス、パスワード、Google認証の状態を表示する。  メールログインの対象として表示・変更するメールアドレスは、Primaryの1件だけとし、UIでは「メインのメールアドレス」と呼ぶ。  過去から残るsecondary EmailAddressや確認途中のEmailAddressがClerk上にあっても、別のログイン対象行としては表示せず、Primary変更に無関係なresourceを推測削除しない。
アカウント設定では、確認コードの送信先と本人再確認factorを含め、current UserのEmailAddress resourceから所有を確認できるメールアドレスを省略せず表示する。  Clerkの`safeIdentifier`がマスキング済みでも、メールアドレスの表示には使用しない。
Clerk内部のprimary・secondaryという用語は製品UIに出さない。
Googleのみの状態ではメールログイン方法を未設定として扱い、EmailAddress resourceが存在してもメールアドレス欄は「未設定」と表示する。  「設定する」から既存のメールアドレス・パスワード設定モーダルを開く。
確認済みPrimary EmailAddressとパスワードがそろう場合は、メールアドレスとGoogle認証の間にパスワード行を表示する。  実際のパスワードは表示せず「設定済み」と表示し、右側の「変更する」から変更モーダルを開く。Googleのみの状態ではパスワード行を表示しない。

ページ見出しの直下には、Google認証の連携状態にかかわらず「Google認証、メールアドレス両方でログインできます。」を表示し、その下に「シフト通知は、個別のユーザーに設定したメール・LINEに送ります。」を表示する。
初回読み込み中はログイン方法一覧の構造をスケルトンで表示し、読み込み専用のメッセージやspinnerは表示しない。

resourceを安全に判定できない場合は、アカウント設定内の局所errorとして表示する。
変更操作のエラーは対象モーダル内に表示し、背面のログイン方法一覧へ同じエラーを重複表示しない。
一つの操作の失敗で認証後アプリ全体を止めない。

## ログイン方法の状態と変更

ログイン方法は、確認済みGoogle ExternalAccount、確認済みEmailAddress、`passwordEnabled`から次の3状態を導出する。
メールドメイン、build mode、環境変数、実験用capabilityは状態や操作可否の条件にしない。

| 状態 | 利用できる操作 |
|---|---|
| Googleのみ | メールアドレスとパスワードの設定 |
| メール・パスワードのみ | メインのメールアドレスとパスワードの変更、Google認証の追加 |
| Googleとメール・パスワードの両方 | メインのメールアドレスとパスワードの変更、Google認証の解除 |

メインのメールアドレスの変更はメール・パスワードのみ、またはGoogleとメール・パスワードの両方の状態で利用できる。  現在のPrimary EmailAddressの`linkedTo`に`oauth_google`が含まれる場合も、Google認証を解除せずに変更できる。
変更先が未確認であれば`email_code`で所有を確認し、入力した確認済みEmailAddressをPrimaryへ切り替える。
確認コード入力モーダルには、直前に入力した変更先メールアドレスを省略せず表示する。
メールアドレスに関係する変更でClerkが本人再確認を要求した場合は、メール確認（`email_code`）を必須とし、方式選択を表示せず確認コード入力へ進める。
メール確認を利用できない場合は変更を中止する。
変更先をPrimaryにした後、操作開始時の旧Primary EmailAddressを同じcurrent UserからIDで解決し直す。  旧Primaryの`linkedTo`に`oauth_google`が含まれる場合は、Googleログインを維持するため確認済みsecondary EmailAddressとして保持し、ExternalAccountも変更しない。  `oauth_google`を含まない旧Primaryだけを削除対象にする。
reload後に、変更先が確認済みPrimaryであり、Google ExternalAccountとパスワードが操作前と同じであることを確認できた場合だけ完了とする。  Google-linked旧Primaryは`linkedTo`に`oauth_google`を含むsecondaryとして残り、未linked旧Primaryは不在であることも、それぞれの完了条件に含める。  Primary変更前から存在したほかのsecondary EmailAddressは、この操作では削除しない。
Primary切替または未linked旧Primaryの削除に失敗した場合は成功を表示しない。  Primary切替前の失敗では旧Primaryを維持し、確認済みの変更先がsecondaryとして残った場合は、再試行時に同じEmailAddress IDを再利用する。  Primary切替後の未linked旧Primary削除に失敗した場合は、可能な限り旧Primaryへ戻してから再試行を案内する。
Clerk APIの応答を失った場合はcurrent Userをreloadし、完了条件を満たしていれば成功へ収束する。  完了条件を満たさない場合は新しいEmailAddressを重複作成せず、最新状態から残りの処理を再試行する。

Googleのみの利用者は、既存の確認済みEmailAddressまたは新たに確認したEmailAddressへパスワードを設定できる。
初回設定のメール入力欄には、現在の確認済みPrimary EmailAddressを優先して初期表示し、存在しなければ現在の確認済みGoogle認証のメールアドレスを表示する。  Primary切替後にpartial retryする場合は、入力済みの確認済みPrimaryをGoogle accountのメールアドレスより優先する。  必要であれば別のメールアドレスへ変更できる。
未確認のメールアドレスを入力した後は、そのアドレスへ送信した6桁の確認コードを入力し、確認済みになってからパスワードを設定する。
すでに確認済みのEmailAddressを入力した場合は、重複するEmailAddressを作らずパスワード設定へ進む。
本人再確認ではメールアドレスの選択画面を表示せず、入力済みのメールアドレスに必要な確認へ進める。
パスワード設定では新しいパスワードと確認用パスワードだけを入力させ、「ほかの端末からログアウトする」選択肢は表示しない。
`User.updatePassword()`には常に`signOutOfOtherSessions: false`を渡し、ほかの端末のsessionを維持する。
入力した確認済みEmailAddressをPrimaryにし、パスワードとGoogle ExternalAccountを確認できた場合だけ設定完了とする。  入力したメールアドレスがGoogle認証のメールアドレスと異なる場合は、Google-linked EmailAddressを同じlinkを持つ確認済みsecondaryとして保持する。  Google認証とシフト連絡先は変更しない。
Primary切替またはパスワード設定の途中で失敗した場合や応答を失った場合は、current Userをreloadして確定状態を確認する。  再試行では入力済みの確認済みEmailAddressをIDで再利用し、Google-linked EmailAddressやExternalAccountを削除せず、未完了の処理だけを続行する。

既存パスワードの変更モーダルでは、現在のパスワード、新しいパスワード、確認用パスワードを入力する。  現在のパスワードとClerkのパスワードポリシーをserver側で検証し、確認用パスワードの一致だけを画面内でも検証する。`User.updatePassword()`には`signOutOfOtherSessions: true`を渡し、変更後は現在の端末を維持してほかの端末をログアウトする。パスワードを忘れた場合は、ログイン画面のメールによるパスワード再設定を利用する。

パスワード変更でClerkが本人再確認を要求した場合は、first factorとして現在のパスワードを優先し、方式選択を表示せず確認入力へ進める。  MFAによるsecond factorが要求された場合は省略しない。変更処理はsingle-flightとし、current Userが切り替わった場合は別Userへ副作用を送らない。応答不明時は新しいパスワードが反映済みの可能性があるため自動再試行せず、成功を表示しない。パスワード値とClerkの生エラーはURL、controller state、永続storage、ログへ保存しない。

メール・パスワードのみの利用者がGoogle認証を追加するときは、ログイン中のcurrent Userへ`createExternalAccount`を実行する。
追加モーダルでは「Googleアカウントを選ぶ」を主操作とし、補助見出しや説明文を重ねない。
「Googleアカウントを選ぶ」押下後にClerkが本人再確認を要求した場合は、方式選択を表示せず現在のパスワード入力へ進める。  パスワード方式を利用できない場合は、メール確認へフォールバックせず操作を中止する。
OAuth開始処理中と帰還後の状態確認中は、主操作を処理中表示にし、本文には状態確認中のSkeletonを表示する。
OAuth帰還後に同じClerk Userと、そこへ属する確認済みGoogle ExternalAccountを再取得してから完了とする。
別のClerk Userへ接続済みのGoogleアカウントは自動統合せず、既存のメール・パスワードを維持してエラーを表示する。

Google追加の失敗またはキャンセルが確定した場合は、今回のOAuth開始時に保存した相関情報からexact ExternalAccountを特定する。  current User、Primaryメールアドレス、パスワードと確認済みEmailAddressが操作開始時と一致し、`failed`、`unverified`、`expired`のGoogle ExternalAccountが一件だけ残っている場合に限り、その未完了resourceを自動で破棄する。破棄後のreloadで不在を確認できた場合は、失敗理由と「Googleアカウントを選ぶ」を同じモーダルに表示して再試行可能にする。

相関情報がない過去の未完了resourceは、画面表示だけを契機に自動削除しない。  メール・パスワードの退避方法を再確認できる一件だけの`failed`、`unverified`、`expired`であれば、「Googleを再接続」から明示的に整理して同じ追加フローを再試行できる。  確認済みGoogle、複数resource、`transferable`を含む未知のverification statusは推測削除せず、新しいOAuthも開始しない。

Google認証の解除ボタンは、連携済みGoogle ExternalAccountに表示する。
操作直前のreloadで有効なパスワードと確認済みPrimary EmailAddressが残る場合だけ解除を許可し、Googleのみの状態では解除しない。
Googleのみの状態で解除しようとした場合は、メールアドレス未設定であることと、先にメールアドレス・パスワードを設定する必要があることを赤いSnackbarで通知する。
解除確認後にClerkが本人再確認を要求した場合は、方式選択を表示せず現在のパスワード入力へ進める。
パスワードが誤っている場合は同じ入力画面に留まり、そのモーダル内にエラーを表示する。
本人再確認が完了してClerkが操作を再実行した場合だけ、対象ExternalAccountを解除する。
対象GoogleのメールアドレスがPrimary EmailAddressと同じ場合は、EmailAddressを保持する。  Clerkのaccount linkingが有効なため、そのGoogleで再度ログインすると同じUserへGoogle ExternalAccountが再連携される場合がある。
対象GoogleのメールアドレスがPrimaryと異なる場合は、そのGoogle ExternalAccountへexactにlinkedした一意の確認済み非Primary EmailAddressを特定できる場合だけ、解除の完了処理としてそのEmailAddressも削除する。  Clerkの`linkedTo`は作成元の履歴ではなく現在の連携を示すため、対象を一意かつ安全に特定できない場合や、Primaryとパスワードのfallbackを維持できない場合は、ExternalAccountとEmailAddressのどちらも変更せず解除しない。  確認画面には付随するEmailAddressや削除対象を表示せず、Googleではログインできなくなることと、Primary EmailAddressとパスワードが残ることだけを案内する。
解除後のreloadで、対象ExternalAccountと必要なEmailAddressの不在、およびPrimary EmailAddress、パスワード、無関係なsecondary EmailAddressの保持を確認できた場合だけ成功を表示する。  一部だけ完了した場合や応答を喪失した場合は成功を表示せず、同じ確認ダイアログを開いたままreloadした最新状態から残りの処理を再試行できるようにする。  cleanup未完了中はダイアログを閉じない。
任意のEmailAddressを利用者が選んで削除する操作と、パスワードの削除は提供しない。  EmailAddressの自動削除は、Primary変更時に`linkedTo`へ`oauth_google`を含まない直前の旧Primaryと、Google解除時にexactに特定した非Primaryだけに限る。  Primary変更後も`oauth_google`を含む旧Primaryはsecondaryとして保持する。
別のGoogleアカウントへ切り替える場合は、メール・パスワードを保持した状態でGoogle解除とGoogle追加を別々に行い、専用のGoogle置換フローは設けない。

変更操作はsingle-flightにし、操作直前に`user.reload()`で最新状態を確認する。  EmailAddressとGoogle認証の変更は、応答喪失後にもreloadして確定状態を確認する。パスワード変更は反映済みの可能性があるため、応答不明時に自動でreloadや再試行を行わない。  Primary切替、`linkedTo`に`oauth_google`を含まない直前の旧EmailAddress削除、パスワード変更は、それぞれClerkの本人再確認対象として扱う。  確認コード送信とGoogle OAuth開始は、同じtab内でactorと操作単位に30秒の絶対期限を保持し、画面遷移やOAuth往復の直後も同じ操作を連続送信しない。  Google OAuthの待機中は、未完了Googleの破棄を含む再接続を開始しない。  このclient側の待機は補助であり、tabをまたぐ頻度制御はClerk serverを正本とする。
Clerkの本人再確認要求でlevelが省略された場合はfirst factorを開始し、`SessionVerification`の完了後に元のClerk APIを再実行する。
本人確認の開始、送信、完了待ちでは、次に表示する入力フォームと同じ構造のスケルトンを表示する。
「最終ログイン方法を確認しています」「本人確認方法を確認しています」などの中間モーダルや単独spinnerは表示しない。
元のClerk APIによる再確認要件の再判定は省略しない。
EmailAddress IDやExternalAccount IDはcurrent Userへの所属を確認してから使い、OAuth開始時と帰還時のClerk `user.id`が一致しなければ完了扱いにしない。
メールアドレス、Clerk User ID、resource ID、確認コード、tokenをURLやログへ含めない。

Google account linkingのOAuth帰還先は`/account`専用とし、サインイン・サインアップ完了用の`/sso-callback`と混同しない。
操作完了はSnackbarで通知し、確認コード送信後の案内は通常の説明文で表示する。

## 管理者招待のメール所有確認

管理者招待の受諾は、招待先をClerk primary emailとみなさない。
この受諾フローは複数管理者の通常経路である。
次の本人確認契約は、Function Test、Scenario Test、専用Preview deploymentのE2Eで維持する。

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
- `/account`：認証済みアプリshellで表示する、本文は店舗・組織非依存の本人用アカウント設定。所属組織がある場合は、ヘッダーから組織scopeの要望を送信できる
- `/manager-invite`：管理者招待のpreviewと受諾

## 主なAPI

- Clerk `useSignIn()`：メール・パスワードログイン、Googleログイン、パスワード再設定
- Clerk `SignIn.mfa.sendEmailCode()` / `mfa.verifyEmailCode()`：別端末ログインのメール確認
- Clerk `useSignUp()`：メール・パスワード登録、Google登録、メール確認
- Clerk `SignIn.sso()` / `SignUp.sso()`：Google認証の開始とCore 3 resourceによるcallback継続
- Clerk `useUser()`：本人のログイン方法resource取得
- Clerk `User.createEmailAddress()`、`EmailAddress.prepareVerification()`、`EmailAddress.attemptVerification()`：招待先などのメール所有確認
- Clerk `User.update()`：確認済みEmailAddressへのPrimary切替
- Clerk `User.updatePassword()`：Googleのみの利用者による初回パスワード設定と、既存パスワードの変更
- Clerk `User.createExternalAccount()`：current UserへのGoogle認証追加
- Clerk `ExternalAccount.destroy()`：メール・パスワードを退避方法として確認した後のGoogle認証解除と、相関済みの失敗後または明示的な再試行で安全性を再確認した未完了Google resourceの整理
- Clerk `useReverification()`：sensitiveな本人操作の追加確認
- `api.organizationInvitation.acceptanceActions.accept`：管理者招待の新しい受諾入口
- `api.accountEmail.actions.syncMyPrimaryEmail`：旧clientを変更なしで停止させる互換stub

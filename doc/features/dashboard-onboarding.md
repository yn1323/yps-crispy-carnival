# ログイン後オンボーディング

店舗登録後の管理ユーザーに、シフト担当者自身で「シフト募集の作成 → 通知確認 → 希望シフトの提出 → シフト表確認 → スタッフ追加」を試してもらう`/dashboard`の案内。スタッフを巻き込む前に通知の届き方を確認できるようにする。

## 関連ファイル

### フロントエンド（`src/`）

- `src/components/features/Dashboard/DashboardContent/index.tsx` — オンボーディング機能とDashboard各セクションを合成する
- `src/components/features/Dashboard/HomeScreenInstallGuidePrompt/` — ホーム画面追加案内の端末・standalone・非表示状態とUIを所有する
- `src/components/features/Dashboard/HeroSummary/` — オンボーディング中に通常の「要対応」セクションを隠す表示制御
- `src/components/features/Dashboard/DashboardOnboarding/` — オンボーディング状態、Callout UI、進捗判定、通常の「要対応」との表示切り替え、モーダル/画面遷移との接続、Storybook、ロジックテストを所有する
- `src/components/features/Dashboard/dashboardTourTargets.ts` — Dashboard内Tourターゲットの共有定数
- `src/components/features/Dashboard/RecruitmentBoard/` — 募集作成ボタンと最新募集カードのTourターゲット
- `src/components/features/Dashboard/StaffRoster/` — スタッフ追加ボタンのTourターゲット
- `src/components/features/Dashboard/SetupModal/` — 初回セットアップで店舗情報、本人の表示名、シフト連絡先、任意のプロモーションコードを登録する
- `src/components/ui/Tour/` — Dashboard用の説明なしスポットライト表示に対応した既存Tourラッパー
- `public/manifest.json` — 既存PWAの識別子`/`を維持し、ホーム画面からstandalone起動したときの開始先を`/dashboard`に指定する
- `src/pages/home/index.tsx` — manifest更新が反映されない既存のホーム画面アプリでも、standaloneで旧開始先`/`を開いた場合は`/dashboard`へ移動する

### バックエンド（`convex/`）

- `convex/dashboard/queries.ts` — Dashboard上の店舗情報・募集一覧・スタッフ一覧取得
- `convex/dashboard/mutations.ts` — チュートリアル終了状態のDB保存
- `convex/setup/mutations.ts` / `convex/setup/service.ts` — 初回セットアップで組織、本人、最初の店舗、シフト連絡先、初期請求先を作成する

## 画面一覧

| 画面 | 役割 |
|---|---|
| シフト担当者ダッシュボード | 「はじめの確認」セクションにCalloutを表示し、次に行う操作へ誘導 |
| シフト募集 | 1/4で募集作成ボタンの場所を案内 |
| シフト募集カード | 3/4で最新募集カードの場所を案内 |
| スタッフ一覧 | 4/4でスタッフ追加ボタンの場所を案内 |

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.dashboard.queries.getDashboardShop` | query | 店舗名・営業時間取得 |
| `api.dashboard.queries.getDashboardRecruitments` | query | 最新募集・提出人数/現在の有効スタッフ数・確定状態から進捗を派生 |
| `api.dashboard.queries.getDashboardStaffs` | query | Dashboard上のスタッフ一覧取得 |
| `api.dashboard.mutations.dismissOnboarding` | mutation | チュートリアル終了状態をDB保存 |
| `api.setup.mutations.verifyPromotionCode` | mutation | 所属0件の本人について、入力したプロモーションコードを初回セットアップ前に副作用なしで照合 |
| `api.setup.mutations.setupShopAndManager` | mutation | 組織所属が0件の本人について、最初の1組織、1店舗、管理者本人、シフト連絡先を作成。コード空欄ではPro相当の2か月Trial、有効なコードでは期限なしの支払い不要Pro相当を適用 |

## 初回セットアップとの境界

- 初回セットアップの「シフト通知先メールアドレス」は、本人のシフト通知と管理者向け連絡に使う連絡先であり、Clerkのログイン方法ではない。
- 初回セットアップは`/dashboard`で組織所属が0件のときだけ表示し、同じ本人が二つ目の組織、店舗、管理者を作る入口として使わない。
- プロモーションコード欄は初期表示で隠し、補助ボタンから任意に展開する。  6桁の英数字を「適用」で事前照合し、成功後は読み取り専用の入力欄と「無料のProプランを適用」を表示する。「変更する」は再編集へ戻し、「入力をやめる」は入力と適用状態を消して領域を閉じる。
- 適用済み状態は初回セットアップ内で前のstepへ戻っても保持する。  未適用の入力が残る間は「利用開始」を無効にし、空欄または「入力をやめる」後は通常のTrial登録を続けられる。
- 不一致時は残り回数を表示せず「コードが誤っています。」と案内する。同じtabで10回不一致になると10分間事前照合を止めるが、入力を消してTrial登録する経路は止めない。
- 入力値が前後空白除去・大文字化後にserver-only設定と一致する場合は、Trialに代えて期限なしの支払い不要Pro相当（`complimentary.pro`）を作る。  事前照合済みでも最終Setupで独立して再照合し、入力済みのコードが適用できない場合は初回セットアップを拒否してTrialへfallbackしない。空欄ではPro相当・利用人数上限50名の2か月Trialを作り、Trial期限と課金deadlineを作成する。
- Trialと支払い不要Pro相当のどちらでも、Stripe Customer、Checkout Session、Subscriptionは作成しない。
- 登録した氏名とシフト連絡先は、最初の`organizationPeople`と`staffs`へ保存する。
- 同じメールアドレスを組織の初期`billingEmail`にも設定するが、請求先は組織設定から独立して変更できる。
- `users.email`にも初回値を保存するが、これは初期化と旧データ互換のための値であり、以後のログイン方法やシフト連絡先の正本にはしない。
- 本文のDashboardオンボーディングは初回セットアップ完了後に始まり、ログイン方法の追加・削除・再接続は扱わない。
- 既存データを支払い不要Pro相当（`complimentary.pro`）へ揃えるmigrationは、この初回セットアップでは実行しない。  有効なコードではmigrationを介さず同じcanonical状態を直接作り、repositoryにmigrationがあることから対象deploymentでの実行完了を推測しない。

## 表示ルール

- 管理ユーザーの法務再同意が必要な間は、再同意バナーを優先して表示しない
- 表示中は通常の「要対応」セクションを出さず、「はじめの確認」セクションを同列に表示する
- オンボーディング表示可否が未確定の間は通常の「要対応」セクションを出さず、リフレッシュ時の一瞬の表示切り替わりを避ける
- 手動で閉じた場合はDBに終了状態を保存し、同じ管理ユーザーでは別端末でも再表示しない
- オンボーディングが消えた後は、スマートフォンの通常ブラウザに限り、ホーム画面追加案内を「要対応」より前に表示する
- PCとstandalone起動ではホーム画面追加案内を表示しない。  案内を閉じた場合はLocalStorageに保存し、同じ端末・ブラウザで再表示しない
- ホーム画面追加案内からは、端末別の使い方`/help/open-shiftori-from-home-screen`を別タブで開く
- Callout内の「ガイド」ボタンはショートカットではなく、次に触る場所を説明なしのTourで表示するだけにする
- 2/4はメールを開く案内なので、Dashboard上のガイドボタンは表示しない
- Tour対象のボタンやカードを押したらTourだけを非表示にし、通常の操作を続行する
- 3/4は提出内容がシフト表に反映されていることを確認するところまでを案内し、対象のシフト表を開いたら同じセッション内では4/4へ進める
- 進捗は専用テーブルを持たず、募集件数・提出人数・募集ステータスから派生する
- 3/4から4/4への遷移だけは、確定操作を求めないため `sessionStorage` に確認済み募集IDを保持する

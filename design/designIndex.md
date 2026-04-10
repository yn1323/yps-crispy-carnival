# Design Index

## dashboard.pen — ダッシュボード画面

| ID | Name | Description |
|---|---|---|
| `RokyI` | Dashboard/Normal | 通常時（シフトあり・スタッフ登録済） |
| `Bieli` | Dashboard/Empty | 初回・空状態（シフトなし・スタッフ未登録） |
| `IdakJ` | Dashboard/CreateRecruitmentModal | シフト希望収集モーダル |
| `1yq4G` | Dashboard/AddStaffModal | スタッフ追加モーダル |
| `IkGpN` | Dashboard/Normal/SP | SP通常時（シフトあり・スタッフ登録済） |
| `NMbYI` | Dashboard/Empty/SP | SP初回・空状態 |
| `3iRDC` | Dashboard/CreateRecruitmentSheet | SPシフト希望収集BottomSheet |
| `QQcZk` | Dashboard/AddStaffSheet | SPスタッフ追加BottomSheet |
| `Mf7qf` | Dashboard/EditStaffModal | PCスタッフ編集モーダル |
| `aF4J8` | Dashboard/EditStaffSheet | SPスタッフ編集BottomSheet |
| `m5Svv` | Dashboard/DeleteStaffDialog | PCスタッフ削除確認ダイアログ |
| `66Jwd` | Dashboard/DeleteStaffSheet | SPスタッフ削除確認BottomSheet |
| `s9hbW` | Dashboard/SetupModal/Step1 | 初回セットアップモーダル Step1（店舗情報・入力済み） |
| `xoJw8` | Dashboard/SetupModal/Step2 | 初回セットアップモーダル Step2（シフト募集作成・初期状態） |
| `VLWsg` | Dashboard/SetupSheet/Step1 | SP初回セットアップSheet Step1（店舗情報・入力済み） |
| `3yqIS` | Dashboard/SetupSheet/Step2 | SP初回セットアップSheet Step2（シフト募集作成・初期状態） |

## shiftboard.pen — シフトボード画面

> **注意**: 以下のIDは現在無効です。ShiftBoard画面フレームの再作成が必要です。

| ID | Name | Description |
|---|---|---|
| ~~`LLTqi`~~ | ShiftBoard/Normal | PC通常時（未確定） |
| ~~`nIHuW`~~ | ShiftBoard/Confirmed | PC確定済み |
| ~~`Wa1Wl`~~ | ShiftBoard/ConfirmDialog | PC確定ダイアログ表示 |
| ~~`tfnDn`~~ | ShiftBoard/Normal/SP | SP通常時（未確定） |
| ~~`K5zai`~~ | ShiftBoard/Confirmed/SP | SP確定済み |
| ~~`0sBBB`~~ | ShiftBoard/ConfirmDialog/SP | SP確定ダイアログ表示 |

## lp.pen — ランディングページ（未ログイン向けトップページ）

| ID | Name | Description |
|---|---|---|
| `TzEz5` | LandingPage/SP | SPランディングページ全体（390px、ナビ→ヒーロー→ポイント→使い方→FAQ→フッター） |
| `QLGoQ` | LandingPage/PC | PCランディングページ全体（1440px、コンテンツ幅768〜1024px、Point/Stepは3カラム横並び） |

## shift-submit.pen — スタッフシフト提出画面

| ID | Name | Description |
|---|---|---|
| `tuyCK` | ShiftSubmit/Unsubmitted | SP未提出＋締切前（状態A） |
| `AnaaY` | ShiftSubmit/Submitted | SP提出済み＋締切前（状態B） |
| `8rGfg` | ShiftSubmit/SubmittedExpired | SP提出済み＋締切後（状態C） |
| `ZNB1Z` | ShiftSubmit/Expired | SP未提出＋締切後（状態D） |
| `W9WOE` | ShiftSubmit/Complete | SP提出完了画面 |

## design.pen
（画面デザイン）

## common/system.lib.pen - Reusable Components

### Templates
| ID | Name | Description |
|---|---|---|
| `qc9x6` | ContentWrapper | コンテンツ領域ラッパー（1024px、padding:32、gap:32） |
| `E7Xz5` | TitleTemplate/PC | PC用ヘッダー（パンくずナビ） |
| `cD5XT` | TitleTemplate/SP | SP用ヘッダー（戻るボタン+タイトル） |
| `gwN4y` | SideMenu | 左固定サイドバー（ロゴ・メニュー・ログアウト） |
| `YloJ8` | BottomMenu | モバイル下部ナビバー |

### UI Components
| ID | Name | Description |
|---|---|---|
| `6nLI6` | BottomSheet | 下部スライドダイアログ |
| `hE1nc` | ColorPicker | カラースウォッチピッカー（8色） |
| `tXGfG` | Dialog | モーダルダイアログ（タイトル・コンテンツ・アクション） |
| `WBKk6` | Empty | 空状態（アイコン・タイトル・説明） |
| `880Ef` | FormCard | アイコン+タイトルヘッダー付きフォームカード |
| `PznSp` | LoadingState | ローディング（スピナー+メッセージ） |
| `DZo1D` | Select | ドロップダウン選択（ラベル・値・補足） |
| `5CGeJ` | Title | ページタイトル（戻るリンク+タイトル+アクション） |

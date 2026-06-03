# ログイン後オンボーディング

店舗登録後の管理ユーザーに、シフト担当者自身で「募集作成 → 通知確認 → 希望提出 → シフト表確認 → スタッフ追加」を試してもらうDashboardの案内。スタッフを巻き込む前に通知の届き方を確認できるようにする。

## 関連ファイル

### フロントエンド（`src/`）

- `src/components/features/Dashboard/DashboardContent/index.tsx` — はじめの確認セクションの表示、通常の今やることセクション非表示、モーダル/画面遷移との接続
- `src/components/features/Dashboard/HeroSummary/` — オンボーディング中に通常の今やることセクションを隠す表示制御
- `src/components/features/Dashboard/DashboardContent/OnboardingCallout/` — Callout UI、進捗判定、Storybook、ロジックテスト
- `src/components/features/Dashboard/dashboardTourTargets.ts` — Dashboard内Tourターゲットの共有定数
- `src/components/features/Dashboard/RecruitmentBoard/` — 募集作成ボタンと最新募集カードのTourターゲット
- `src/components/features/Dashboard/StaffRoster/` — スタッフ追加ボタンのTourターゲット
- `src/components/ui/Tour/` — Dashboard用の説明なしスポットライト表示に対応した既存Tourラッパー

### バックエンド（`convex/`）

- `convex/dashboard/queries.ts` — Dashboard上の店舗情報・募集一覧・スタッフ一覧取得
- `convex/dashboard/mutations.ts` — チュートリアル終了状態のDB保存

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

## 表示ルール

- 管理ユーザーの法務再同意が必要な間は、再同意バナーを優先して表示しない
- 表示中は通常の「今やること」セクションを出さず、「はじめの確認」セクションを同列に表示する
- オンボーディング表示可否が未確定の間は通常の「今やること」セクションを出さず、リフレッシュ時の一瞬の表示切り替わりを避ける
- 手動で閉じた場合はDBに終了状態を保存し、同じ管理ユーザーでは別端末でも再表示しない
- Callout内の「ガイド」ボタンはショートカットではなく、次に触る場所を説明なしのTourで表示するだけにする
- 2/4はメールを開く案内なので、Dashboard上のガイドボタンは表示しない
- Tour対象のボタンやカードを押したらTourだけを非表示にし、通常の操作を続行する
- 3/4は提出内容がシフト表に反映されていることを確認するところまでを案内し、対象のシフト表を開いたら同じセッション内では4/4へ進める
- 進捗は専用テーブルを持たず、募集件数・提出人数・募集ステータスから派生する
- 3/4から4/4への遷移だけは、確定操作を求めないため `sessionStorage` に確認済み募集IDを保持する

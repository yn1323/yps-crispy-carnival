# apps/analytics-dashboard/AGENTS.md

このファイルは `apps/analytics-dashboard/` 配下へ適用する。
ルートの `AGENTS.md` と併せて読む。

## 位置づけ

- このappは本人だけが使う内部BIであり、利用者向けSaaS本体とは分離する。
- 現在の機能、画面、データ取得の概要は `doc/features/analytics-dashboard.md` を参照する。
- runtime、entry、scripts、環境変数の現在値は、このappのコードとルート `package.json` を正とする。
- 本体のUI、Storybook、E2E、Full Regressionの対象へ混ぜない。

## 境界

- browserからConvexや外部analytics serviceへ直接接続せず、既存BFFを通す。
- 管理用secretとcredentialはserver側だけで扱い、client bundle、URL、ログ、エラー本文へ含めない。
- 取得対象は分析に必要な最小限へ絞り、氏名、メールアドレス、token、通知本文などの個人情報を表示・保存しない。
- 集計値の定義、期間、timezone、除外条件を既存実装と合わせる。
- 本体の共通componentやdomainを、内部BIだけの都合で変更しない。

## 変更範囲

- 近い既存実装に沿う最小差分にする。
- 新しいchart、集計、KPIを追加する場合は、値の出所と計算式をコード上で追跡できるようにする。
- 0件、取得中、取得失敗、partial dataを区別する。
- 本人向けであっても、危険な操作やsecret露出を許容しない。

## テストと確認

- このappには新しいLogic/UI/Storybook/VRT/E2Eテストを追加・維持しない。
- 変更時は次を実行する。

```bash
pnpm analytics:lint
pnpm analytics:type-check
pnpm analytics:build
```

- 開発サーバーはユーザーが起動しているため、新規起動しない。

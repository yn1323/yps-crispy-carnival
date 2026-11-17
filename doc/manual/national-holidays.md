# 祝日の表の更新

> 文書種別: manual
>
> 対象: 祝日の表（`nationalHolidays`）を持つConvex deployment

祝日の表は、[シフト作成の設定](../features/shift-setup.md)の「祝日に使うテンプレート」を、どの日に当てるかを決めるためのデータです。  
店舗の画面からは更新できません。  運営者が、年ごとにこの手順で入れます。

## 更新する場面

- 翌年の祝日が決まったとき。  内閣府は、翌年の祝日を毎年2月ごろに公表します。
- 祝日が年の途中で変わったとき。
- localまたはDevelopmentで[開発用網羅シード](development-seed.md)を実行したあと。  シードは全テーブルを空にするため、祝日の表も空になります。

翌年分を入れないまま年を越すと、翌年の祝日は祝日として扱われず、曜日のテンプレートが当たります。  
店舗へ知らせる仕組みはないため、年末までに翌年分を入れてください。

## 入れる内容

1年分の祝日を、日付と名前の一覧で渡します。

- 日付は`YYYY-MM-DD`で、指定した年のものだけを渡します。
- 振替休日と国民の休日も、1件ずつ一覧へ入れます。
- 名前は30文字まで、1年に50件までです。

指定した年の表は、渡した一覧で丸ごと置き換わります。  
同じ一覧で繰り返し実行しても、同じ状態になります。  
別の年の日付、重複、存在しない日付が1件でもあると、全体が拒否されて表は変わりません。

## 実行する

localでは、`.env.local`が指す個人用のdeploymentへ入れます。

```bash
pnpm convex:run:local nationalHoliday/mutations:replaceNationalHolidaysForYear '{"year":2027,"holidays":[{"date":"2027-01-01","name":"元日"},{"date":"2027-01-11","name":"成人の日"}]}'
```

Developmentでは、`.env.develop`が指すdeploymentへ入れます。

```bash
pnpm convex:run:dev nationalHoliday/mutations:replaceNationalHolidaysForYear '{"year":2027,"holidays":[{"date":"2027-01-01","name":"元日"}]}'
```

Productionでは、deploymentを短縮名ではなく完全修飾名で指定します。

```bash
pnpm exec convex run nationalHoliday/mutations:replaceNationalHolidaysForYear \
  '{"year":2027,"holidays":[{"date":"2027-01-01","name":"元日"}]}' \
  --deployment <fully-qualified-deployment>
```

上の一覧は書き方の例です。  実行するときは、その年の祝日をすべて入れてください。

## 確かめる

コマンドは、消した件数と入れた件数を`{ deletedCount, insertedCount }`で返します。  
入れた件数が、渡した一覧の件数と同じであることを確かめます。

画面では、祝日に使うテンプレートを持つ店舗のシフト表を「くわしく」表示で開き、祝日の日にそのテンプレートの名前が出ることを確かめます。

## 影響する範囲

- 確定していない募集のシフト表は、次に開いたときから新しい祝日でテンプレートが当たります。
- 確定済みの募集は、確定した時点の必要人数を保存しているため、変わりません。
- その日だけの指定がある日は、祝日よりその指定が優先されます。

## コードの入口

| 責務 | 入口 |
|---|---|
| 祝日の置き換え | `convex/nationalHoliday/mutations.ts` |
| 期間内の祝日の読み取り | `convex/nationalHoliday/service.ts` |
| その日に当たるテンプレートの解決 | `convex/shiftSetup/dayTemplates.ts` |

---
name: seed
description: 選んだ実行先（ローカル、PR環境、develop）の管理者ユーザー1人の組織を消し、シフト作成の確認に使うデータを網羅的に入れ直す。ユーザーが`/seed`で起動したときだけ使う。
disable-model-invocation: true
---

# 確認用データを入れる

画面で作った管理者ユーザーに、3つの集め方の店舗、スタッフ、必要人数、4つの状態の募集、希望とメモ、割り当てをまとめて入れる。
このスキルは、ユーザーが `/seed` で起動した場合だけ使う。

入れる中身は`convex/userSeed/builders.ts`、決めた仕様は`doc/plans/2026-11-22_ユーザー単位の確認用データ投入_実装計画.md`、人向けの説明は`doc/manual/user-seed.md`を正本とする。

## 守ること

- 本番（`proficient-kookabura-834`、`prod`、`--prod`）には、どの手順でも接続しない。閲覧もしない。指定されたら断る。
- 実行先は毎回聞く。前回の実行先を使い回さない。
- Convex CLIには、毎回`--deployment`で実行先を完全修飾して渡す。既定の実行先に頼らない。
- `--push`を付けない。一時ファイルを`convex/`へ置かない。関数はコードと一緒にデプロイ済みのものを使う。
- 削除の前に、消す組織と残す組織を示して確認を取る。確認なしに`resetUserOrganizations`を呼ばない。
- ユーザーのメールアドレスは、ユーザーを選ぶときだけ示す。ほかの出力やファイルへ書かない。

## 1. 実行先を聞く

AskUserQuestionで、次の3つから選んでもらう。

| 選択肢 | `--deployment`に渡す値 |
|---|---|
| ローカル | `fortunate-mallard-809` |
| PR環境 | `preview/pr-<PR番号>-deploy` |
| develop | `knowing-chihuahua-595` |

PR環境を選んだら、`gh pr view --json number`で今のブランチのPR番号を調べ、その番号でよいかを同じ質問で確かめる。
PRがないときは番号を聞く。

以降、選んだ値を`<deployment>`と書く。

## 2. 実行先の準備を確かめる

次の2つを確かめる。

```bash
npx convex function-spec --deployment <deployment>
```

出力の`identifier`に`userSeed/mutations.js:seedUserOrganization`がなければ、その実行先にはまだこの機能がデプロイされていない。
ローカルなら`convex dev`が動いているかを、PR環境とdevelopならこの機能を含むコードがデプロイ済みかを伝えて止める。

```bash
npx convex env get DEBUG_MODE --deployment <deployment>
npx convex env get DEBUG_NOTIFICATION_DELIVERY_MODE --deployment <deployment>
```

- `DEBUG_MODE`が`true`でなければ、設定してよいかを聞く。了承を得たら`npx convex env set DEBUG_MODE true --deployment <deployment>`で設定する。断られたら止める。
- `DEBUG_NOTIFICATION_DELIVERY_MODE`が`dry-run`でなければ、知らせて続けるかを聞く。投入そのものは通知を予約しないが、入れたデータを画面で操作すると、管理者本人のメールアドレスへ通知が届く場合がある。

## 3. ユーザーを選ぶ

```bash
npx convex run userSeed/queries:listUsers '{}' --deployment <deployment>
```

- 0人なら、画面でユーザーを作ってからもう一度`/seed`するよう伝えて止める。
- 1人なら、そのユーザーを使う。
- 2人以上なら、名前とメールアドレスで選んでもらう。4人までならAskUserQuestion、5人以上なら一覧を番号付きで示して番号を聞く。

## 4. 削除の確認を取る

選んだユーザーの`organizations`から、次を示して、消してよいかを聞く。

- 消す組織: `canDelete`が`true`の組織の名前。
- 残す組織: `canDelete`が`false`の組織の名前と`reason`。ほかの管理者がいる組織や有料契約の組織は消さない。

消す組織が0件なら、確認を取らずに5章の投入へ進んでよい（何も消さないため）。
developでは、消す組織が0件でも投入してよいかを必ず聞く。

## 5. 消して、入れる

```bash
npx convex run userSeed/mutations:resetUserOrganizations '{"userId":"<userId>"}' --deployment <deployment>
npx convex run userSeed/mutations:seedUserOrganization '{"userId":"<userId>"}' --deployment <deployment>
```

- 削除は、画面から組織を削除したときと同じ処理で論理削除する。権限や連絡手段の後片付けは、そのあと自動で進む。
- 投入は1回のmutationで全件を書く。失敗したら何も残らないので、原因を直してから投入だけをやり直せる。
- 組織の作成上限のエラーが出たら、残した組織のために上限に達していることを伝えて止める。

## 6. 報告する

投入の結果から、次を短く示す。

- 実行先、ユーザーの名前、消した組織と残した組織。
- 作った組織の名前と、店舗ごとの募集（期間、状態、提出数、希望の数、メモの数、割り当ての数）。
- `noteMismatchCount`。0でなければ、メモと希望が食い違っていることを不具合として伝える。
- `randomSeed`。同じ内容を作り直したいときは、`seedUserOrganization`へ`"randomSeed"`を渡す。
- PR環境では、プッシュでpreviewが作り直されるとデータが消えるため、そのたびに`/seed`が要ること。

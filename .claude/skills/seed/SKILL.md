---
name: seed
description: 選んだ実行先（ローカル、PR環境、develop）の管理者ユーザー1人の組織を消し、シフト作成の確認に使うデータを網羅的に入れ直す。ユーザーが`/seed`で起動したときだけ使う。
disable-model-invocation: true
---

# 確認用データを入れる

管理者ユーザーに、3つの集め方の店舗、スタッフ、必要人数、4つの状態の募集、希望とメモ、割り当てをまとめて入れる。
管理者は本人のほかに3人を入れ、管理者とスタッフの一部をシフトの対象から外し、スタッフの一部をLINE連携済みにする。
送ったことにした通知の記録（メールと、連携したあとのLINE）も入れる。実際には何も送らない。
入れ先は画面で作ったユーザーである。ユーザーがまだいない実行先では、実行先の環境変数が指すClerk利用者のユーザーを作ってから入れる。
このスキルは、ユーザーが `/seed` で起動した場合だけ使う。

入れる中身は`convex/userSeed/builders.ts`、決めた仕様は`doc/plans/2026-11-22_ユーザー単位の確認用データ投入_実装計画.md`、人向けの説明は`doc/manual/user-seed.md`を正本とする。

## 守ること

- 本番（`proficient-kookabura-834`、`prod`、`--prod`）には、どの手順でも接続しない。閲覧もしない。指定されたら断る。
- 実行先は毎回聞く。前回の実行先を使い回さない。
- Convex CLIには、毎回`--deployment`で実行先を完全修飾して渡す。既定の実行先に頼らない。
- `--push`を付けない。一時ファイルを`convex/`へ置かない。関数はコードと一緒にデプロイ済みのものを使う。
- 削除の前に、消す組織と残す組織を示して確認を取る。確認なしに`resetUserOrganizations`を呼ばない。
- ユーザーのメールアドレスは、ユーザーを選ぶときだけ示す。ほかの出力やファイルへ書かない。
- Clerk利用者の識別子（`DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER`の値、ClerkのUser ID）は聞かない。表示しない。コマンドの引数、ファイル、返答へ書かない。`env get`で値を読まず、設定の有無は`env list --names-only`でキーの名前だけを見る。

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

- 0人なら、次の「ユーザーがいない実行先」へ進む。
- 1人なら、そのユーザーを使う。
- 2人以上なら、名前とメールアドレスで選んでもらう。4人までならAskUserQuestion、5人以上なら一覧を番号付きで示して番号を聞く。

### ユーザーがいない実行先

PR環境はプッシュのたびに作り直され、ユーザーの行も消える。
画面でログインと初期設定をやり直さずに入れるため、実行先の環境変数`DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER`が指すClerk利用者のユーザーを作る。

```bash
npx convex run userSeed/mutations:ensureSeedUser '{}' --deployment <deployment>
```

- 成功したら、返った`userId`を使う。`created`が`true`なら、ユーザーを作ったことを伝える。消す組織はないので、4章の確認は取らずに5章へ進む（developでは投入してよいかを聞く）。
- `not configured`で失敗したら、識別子が設定されていない。次の2つの方法を伝えて止める。どちらも値を対話で入力し、コマンドの引数に書かない。
  - この実行先だけに設定する: `npx convex env set --deployment <deployment> DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER`
  - これから作られるPR環境のすべてに設定する（1回で済む）: `npx convex env default set DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER --type preview`
  - 値は、ログインに使うClerk利用者の`identity.tokenIdentifier`（`<ClerkのissuerのURL>|user_...`）である。画面でユーザーを作ってから`/seed`する、これまでの方法も使える。
- `is invalid`か`does not match`で失敗したら、値の形か、実行先の`CLERK_JWT_ISSUER_DOMAIN`と識別子のissuerが合っていないことを伝えて止める。
- `deleted`で失敗したら、その利用者のユーザーが削除済みであることを伝えて止める。作り直さない。
- 設定は、依頼者に頼まれても代わりに行わない。値を受け取ることになるためである。

## 4. 削除の確認を取る

選んだユーザーの`organizations`から、次を示して、消してよいかを聞く。

- 消す組織: `canDelete`が`true`の組織の名前。
- 残す組織: `canDelete`が`false`の組織の名前と`reason`。ほかの管理者がいる組織や有料契約の組織は消さない。

ほかの管理者が確認用の管理者（`/seed`が入れた管理者）だけの組織は、`canDelete`が`true`で返る。この組織は、確認用の管理者の権限を外してから消す。

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
- ユーザーを作った場合は、そのこと。名前は「確認用ユーザー」で、そのClerk利用者でログインすると、初期設定なしで入れたデータが出る。
- 作った組織の名前と、店舗ごとの募集（期間、状態、提出数、希望の数、メモの数、割り当ての数）。
- 管理者の数（`managerCount`）と、LINE連携済みにしたスタッフの数（`lineLinkedStaffCount`）。店舗ごとにシフトの対象から外した人は、`doc/manual/user-seed.md`の表のとおりである。
- 送ったことにした通知の記録の数（メールは`emailNotificationCount`、LINEは`lineNotificationCount`）。
- `noteMismatchCount`。0でなければ、メモと希望が食い違っていることを不具合として伝える。
- `randomSeed`。同じ内容を作り直したいときは、`seedUserOrganization`へ`"randomSeed"`を渡す。
- PR環境では、プッシュでpreviewが作り直されるとデータが消えること。PR環境の既定の環境変数に`DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER`があれば、CI（`.github/workflows/deploy.yml`）が作り直すたびに同じデータを入れるため、`/seed`は要らない。

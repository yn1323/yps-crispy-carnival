# 管理者と請求管理者の権限方針

シフトリでは、ログインユーザーの権限を店舗ごとの所属として扱う。

同じユーザーが複数店舗に所属でき、店舗ごとに通常の管理権限と請求管理権限を分けられるようにする。

## 権限モデル

**staff**：シフト提出と確定シフト閲覧を行うスタッフ権限。

**manager**：staffでできることに加えて、Dashboard、シフト作成、シフト調整、スタッフ承認、manager向け通知を利用できる管理権限。

**billingManager**：managerでできることに加えて、課金開始後の支払い管理、プラン変更、支払い方法変更、請求書確認、解約を行える請求管理権限。

`billingOwner` のような特別な1人は置かない。

請求管理の責任者を1人に固定すると、退職や不在時に請求操作が止まるためである。

`billingManager` は複数人持てる上位managerとして扱う。

## 店舗所属としての権限

manager権限とbillingManager権限は、ユーザー単位ではなく店舗所属に持たせる。

同じユーザーが店舗AではbillingManager、店舗Bではmanagerになる可能性があるため、`users` に請求権限を持たせると店舗ごとの意味が崩れる。

実装時は `shopMembers.role` を `manager` または `billingManager` として扱う。

manager向けAPIは、`manager` と `billingManager` のどちらも通す。

請求系APIは、`billingManager` だけを通す。

## manager招待

manager追加は、既存スタッフをmanager化する方式にする。

知らないメールアドレスを直接managerとして招待する方式は、店舗スタッフとの対応関係が曖昧になりやすい。

既存スタッフから始めることで、招待対象、通知先、シフト対象としての本人を同じレコードに結び付けられる。

招待リンクは1つのURLで扱う。

```text
/manager/invite?token=xxx
```

未ログインのユーザーがリンクを開いた場合は、ログインまたはアカウント作成へ誘導する。

ログインまたはアカウント作成が完了したら、同じ招待URLへ戻して確認画面を表示する。

ログイン済みのユーザーがリンクを開いた場合は、そのまま確認画面を表示する。

招待tokenは、ログイン前のプレビューでは消費しない。

ログイン後の確認画面で「管理者になる」を押し、店舗所属とスタッフ紐付けの更新に成功した時点で消費する。

招待tokenは1回使ったら廃止する。

有効期限は72時間を基本とする。

manager招待はアカウント作成を含むことがあるため、24時間では短い。

一方で、権限付与リンクを長く有効にする必要もない。

既存のLINE連携tokenと同じ72時間に寄せると、メールとLINEで送る招待リンクとして扱いやすい。

## 招待の配信方法

manager招待リンクは、メールまたはLINEで送る。

LINEは認証手段ではなく、同じURLを届ける手段として扱う。

最終的なmanager承認は、Clerkでログインしたシフトリアカウントに対して行う。

ログイン中ユーザーのメールアドレスは、対象スタッフのメールアドレスと一致必須にする。

この制約は、既存スタッフをmanager化する方針と対応している。

メールが一致しないアカウントで開いた場合は、別アカウントでログインし直す案内を出す。

## 課金開始とbillingManager

managerは、初回アップグレードを開始できる。

課金開始の前に誰かをbillingManagerへ昇格させる手順を要求すると、初回導線が重くなるためである。

Stripe Checkoutを完了したユーザーは、自動でその店舗のbillingManagerになる。

Checkout前の画面では、次の意味を短く伝える。

```text
支払い完了後、このアカウントが請求管理者になります。
請求管理者はあとから追加できます。
```

課金開始後は、billingManagerだけが支払い管理、プラン変更、支払い方法変更、請求書確認、解約を行える。

## billingManagerの追加と削除

billingManagerの追加と削除は、billingManagerだけが行える。

manager全員が請求管理者を増やせる設計にすると、支払い方法や解約に到達できる人を現場権限だけで増やせてしまう。

通常時は、最後のbillingManagerを削除できない。

最後のbillingManagerを削除できると、Stripe契約は残ったまま支払い方法変更、請求書確認、解約ができない店舗が生まれる。

事故時は、サポート対応で別managerへ請求管理権限を移譲する。

「billingManagerが不在なら他managerが自動的に引き継げる」というルールはMVPでは置かない。

このルールは便利だが、請求権限の乗っ取りに近い操作も可能にしてしまう。

## Stripe Customer Portal

店舗利用者は、Stripe専用アカウントを作らない。

シフトリにログインしたbillingManagerがボタンを押すと、シフトリbackendが権限を確認し、Stripe Customer Portalの一時URLを発行する。

Stripe PortalはbillingManagerだけが開ける。

Stripe上のCustomerは店舗単位で持つ。

```text
店舗A
  stripeCustomerId: cus_xxx

山田さん billingManager
  cus_xxx のPortal URLを発行

佐藤さん billingManager
  cus_xxx のPortal URLを発行
```

複数billingManagerがいても、全員が同じ店舗のStripe Customer Portalを見る。

現在のプラン、支払い方法、請求先情報、請求書、解約状態は同じCustomerに紐付く。

個人ごとのStripeアカウントを見るわけではない。

## managerに見せる課金情報

現在のプランと利用状態は、店舗の状態説明としてmanagerにも見せる。

managerは、有料機能が使えるかどうか、現在のプラン、請求管理者一覧を確認できる。

managerは、支払い方法、請求書、領収書、解約、プラン変更を操作できない。

managerには、支払い情報の変更は請求管理者に依頼する案内を表示する。

billingManagerには、manager向けの表示に加えてStripe Portalを開く操作を表示する。

## 店舗切り替え

複数manager対応では、裏側の店舗切り替えが必要になる。

招待を承認したユーザーが既に別店舗のmanagerだった場合、そのユーザーは複数店舗に所属する。

その状態でAPIが暗黙に最初の所属店舗を選ぶと、別店舗のDashboardやシフトに対して操作する危険がある。

実装時は、選択中の `shopId` をmanager向けAPIに渡し、`shopMembers` で所属を確認してから店舗データを扱う。

UIは、複数店舗に所属するユーザーだけに小さな店舗切り替えを出せばよい。

単一店舗のユーザーに余分な導線を見せる必要はない。

## 通知

manager向け通知は、店舗のactive manager全員を対象にする。

ここでいうmanagerには、billingManagerも含める。

スタッフ承認依頼のような現場通知は、`shopMembers` から店舗所属のmanager usersを取得して配信する。

通知の宛先は、スタッフ一覧のうち `userId` が店舗所属managerに紐付くレコードからLINE連携を判定する。

メールはユーザーのメールアドレスを使う。

dry-run通知抑止のような開発用判定は、「最初に見つかったmanager」ではなく店舗単位のルールとして整理する。

## 想定データ

manager招待tokenは、店舗、対象スタッフ、発行者、有効期限、使用状態、無効化状態を持つ。

```ts
managerInviteTokens: {
  shopId,
  staffId,
  token,
  invitedByUserId,
  expiresAt,
  usedAt?,
  revokedAt?,
  acceptedByUserId?,
  createdAt,
}
```

`shopMembers` は、店舗ごとの権限と監査情報を持つ。

```ts
shopMembers: {
  shopId,
  userId,
  role: "manager" | "billingManager",
  isDeleted,
  createdAt?,
  createdByUserId?,
  updatedAt?,
}
```

既存データでは `shopMembers.role` が `manager` だけなので、実装時は互換性を保ちながら広げる。

既存の全active membershipはmanagerとして扱う。

## 実装時の注意点

スタッフ一覧の管理者判定は、ログイン中ユーザー自身かどうかで判定しない。

複数managerでは、他のmanagerスタッフにも管理者バッジと削除制御が必要になる。

判定は、スタッフの `userId` が同じ店舗のactive `shopMembers` に存在するかで行う。

manager解除時は、対象スタッフを削除しない。

解除するのは店舗所属の管理権限であり、スタッフとしての所属は残す。

ただし、manager自身が自分を最後の操作可能な管理者として削除できるかどうかは、別途ガードする。

billingManager解除時は、最後のbillingManager削除不可を同じtransaction内で確認する。

Stripe Portal URL発行は、直前にbillingManager権限を確認する。

権限確認はフロントエンド表示だけに依存しない。

## テスト方針

manager招待tokenは、Convex Function Testで期限切れ、使用済み、無効化済み、メール不一致、他店舗スタッフ、削除済みスタッフを検証する。

manager招待の承認フローは、Convex Scenario Testで既存スタッフがmanagerになり、Dashboard、シフト、manager向け通知に到達できることを検証する。

複数店舗所属は、選択中 `shopId` で対象店舗だけを操作でき、他店舗データに触れないことをFunction Testで検証する。

billingManagerは、Checkout完了者が自動昇格すること、billingManagerだけがPortal URLを発行できること、最後のbillingManagerを削除できないことを検証する。

UIは、Storybookで招待確認画面、期限切れ画面、メール不一致画面、請求管理者一覧、manager向け課金案内を代表状態として持つ。

ログインとリダイレクトを含む最終確認は、E2Eで主要ハッピーパスだけを見る。

## 関連ファイル

- `doc/features/manager-shop-membership.md`
- `doc/features/billing-plans.md`
- `doc/rules/testing-strategy.md`
- `convex/schema.ts`
- `convex/_lib/functions.ts`
- `convex/billing/service.ts`
- `convex/dashboard/queries.ts`
- `convex/staffRegistration/notificationQueries.ts`
- `src/stores/shop/index.ts`

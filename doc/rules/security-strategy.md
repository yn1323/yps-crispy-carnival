# セキュリティ方針

## 目的

この文書は、シフトリで守る資産と信頼境界、セキュリティ判断の基準を定める。
レビューの発動条件と手順は `shiftori-security-review`、Convexの状態設計は `convex-design-strategy.md`、テスト層は `testing-strategy.md` が所有する。

## 基本原則

認証、認可、入力制約、店舗境界、冪等性をフロントエンドの表示だけで保証しない。
hidden field、localStorage、route guard、推測しにくいIDは認可にならない。

public functionとHTTP routeは、許可されていない利用者からも呼ばれる攻撃面として扱う。
入力、主体、対象、所属、状態をサーバー側で検証してから、情報返却と状態変更を行う。

権限拒否、期限切れ、重複要求などの異常系では、DB更新、scheduler、外部副作用を増やさない。

## Actor、Asset、Trust Boundary

セキュリティに関わる変更では、少なくとも次を特定する。

- **Actor**：操作主体と認証方式。
- **Asset**：保護する店舗データ、個人情報、権限、通知、課金状態。
- **Trust Boundary**：ブラウザとbackend、匿名HTTP、provider Webhook、service間通信などの境界。
- **Abuse Case**：IDOR、列挙、replay、spam、二重実行、credential漏洩時の悪用。
- **Server-side Check**：認証、所属、scope、状態、入力上限。
- **Recovery**：失効、rotation、retry、削除、監査。

対象変更に関係する項目だけを具体化し、無関係な脅威を実装範囲へ広げない。

## 管理者と店舗境界

管理者の権限は、認証providerのidentityからアプリ内userとactive membershipを解決し、対象店舗との関係を検証して決める。
認可のための `userId`、role、membershipをclientから受け取って信用しない。

`shopId` は対象店舗の指定であり、権限そのものではない。
店舗スコープの処理は、active membership、店舗の有効状態、必要なroleまたはpermissionをサーバー側で確認する。

user-controlledなstaff、recruitment、position、submission、notification、billingなどのIDは、取得後に同じ店舗へ属することを検証する。
他店舗、削除済み、不在の区別が情報を漏らす場合は、同じ外部応答へ寄せる。

課金に関わる操作は、UIの非表示に加えて、サーバー側でbilling権限とentitlementを再確認する。

## スタッフ用tokenとsession

スタッフ用のmagic linkとsessionは、管理者認証とは別の境界として扱う。
サーバー側でtokenまたはsessionを検証し、staff、shop、recruitment、用途の整合性と有効状態を確認する。

submitとviewなど権限の用途を分け、一方のcredentialで他方を実行させない。
staff、shop、recruitmentを再取得し、非削除状態と店舗の一致を確認する。

token検証、再発行、通知要求のようにブルートフォースやspamへつながる入口にはrate limitを設ける。

## Capability

bearer tokenは、漏れた利用者が権限を行使できるcredentialとして扱う。
scope、有効期間、使用回数、再発行、失効の状態モデルは `convex-design-strategy.md` を正本とする。

DB照合だけに使うtokenは、raw tokenを再表示する必要がない限りdigestを保存する。
raw tokenを通知payloadへ保持する場合は、配送、失効、保持期限に応じてredactする。

公開登録や招待の外部応答は、未登録、登録済み、申請中などの状態を列挙できない形にする。
匿名要求だけでstaffまたはmanager権限を付与せず、承認またはログイン後の検証を必要とする。

## 匿名HTTPと外部連携

HTTP routeはmethod、path、content type、body上限、event件数上限、CORS、認証方式、replay、rate limitを定義する。
request制約、bot proof、署名、credentialを検証した後だけinternal mutationへ状態変更を渡す。

provider Webhookはraw bodyに対する公式の署名検証を行い、検証前にDBを変更しない。
timestamp、nonce、event IDがある場合は、許容時刻幅とdedupeでreplayを拒否する。

service間credentialはサーバー側の環境変数に置き、URL query、client response、ログへ含めない。
credentialは安全に比較し、rotationと失効の方法を持たせる。

## 通知と外部副作用

通知の送信と再送は、情報漏洩、迷惑送信、外部コストの境界として扱う。
ユーザー操作で副作用を積む入口には、rate limit、dedupe、冪等性を設ける。

同じ操作の連打やretryで、同じ宛先への処理意図を重複作成しない。
対象店舗またはstaffの削除開始後は新しいenqueueを拒否し、外部送信の直前にも対象の有効性を確認する。

受付、処理中、送信成功、配送成功を同じ状態として外部へ説明しない。
永続workflow、lease、中断復旧の設計は `convex-design-strategy.md` を正本とする。

## ログと個人情報

ログは調査に必要な情報だけを持たせ、credentialと個人情報の保存先にしない。
raw token、authorization header、Webhook body、secret、full email addressを記録しない。

必要な場合は、email domain、内部ID、event type、status、reasonなどの安全な要約を使う。
外部providerのresponse bodyは、そのままclientへ返したりDBへ保存したりしない。

個人情報を持つtableごとに、利用目的、保持期限、redact対象、監査保持、削除時の扱いを定める。
論理削除、契約終了、法的な消去要求を同じ状態として扱わない。
データ寿命と再開可能な削除処理は `convex-design-strategy.md` を正本とする。

## 最小権限

public APIは、呼出し主体が必要とする最小DTOだけを返す。
document全体、token、内部エラー、Outbox詳細、不要なメールアドレスを返さない。

external Action、GitHub Actions、service credentialには、処理に必要な最小権限と最小scopeだけを与える。
読み取りprobeと破壊的commandを同じcredentialへまとめない。

## テスト契約

セキュリティ修正では、安全でない実装で失敗する回帰テストを主担当層へ置く。

Function Testは、未認証、権限不足、IDOR、削除済み、最小DTO、token状態、HTTP制約、署名、credential、replay、rate limit、拒否時の副作用ゼロを守る。
Scenario Testは、複数API後の店舗境界、古いcapabilityの失効、通知の重複、中断復旧、削除との競合、retentionを守る。
E2Eは、実frontend、実backend、実認証の主要境界だけを守る。

セキュリティ契約をUIの非表示、VRT、E2Eだけで保証しない。

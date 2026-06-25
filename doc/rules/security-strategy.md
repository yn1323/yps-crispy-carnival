# セキュリティ方針

## 目的

このドキュメントは、シフトリのセキュリティ設計とレビュー観点を定義する。
特に、コード実装後のレビューだけでなく、プラン・仕様検討・API設計・schema設計の段階で security lens を入れるための方針を明確にする。

実装時の細かいレビュー手順、チェックリスト、自己更新ルールは `.agents/skills/shiftori-security-review/` を参照する。

## 運用

- セキュリティ、認証、認可、IDOR、magic link、token、招待、Webhook、LINE、Resend、billing、個人情報ログに触れる相談・プラン・設計・実装・レビューでは、実装前に `shiftori-security-review` を使う。
- Convex public query / mutation / action、staff token / session、manager / billing 権限、外部HTTP action、通知配送、登録/招待導線に触る可能性がある場合も同様に扱う。
- ユーザーからセキュリティ観点について指摘を受けた場合は、実装修正だけで終わらせず、このドキュメントと `.agents/skills/shiftori-security-review/` の更新も検討する。
- セキュリティ変更のテスト層は `doc/rules/testing-strategy.md` と `test-strategy` skill で決める。

## 設計時の Security Lens

セキュリティに関わるプランや仕様には、必要に応じて次の観点を短く含める。

```md
### Security Lens

- Actor:
- Asset:
- Trust boundary:
- Abuse case:
- Server-side check:
- Rate limit / idempotency:
- Logs / PII:
- Regression test:
```

フロントエンドの表示制御、hidden field、localStorage、長いUUID、route guard は認可ではない。
保護すべき判断は必ずサーバー側で行う。

## 基本方針

### Convex public function は攻撃面

Convex の public query / mutation / action はクライアントから直接呼べる前提で設計する。

- 全 public function に runtime validator を置く。引数がない場合も `args: {}` を使う。
- client から渡された `userId`、`shopId`、role、staffId、recruitmentId、token の文脈を信用しない。
- public API を増やす前に、internal function に閉じられないか確認する。
- 返り値は最小DTOにする。ドキュメント全体、token、内部エラー、outbox詳細、不要なメールアドレスを返さない。
- attacker-controlled な一覧取得では、index と上限を優先し、無制限の `.collect()` を避ける。

### 管理者境界

管理者系の正は次の流れとする。

```text
Clerk identity -> identity.tokenIdentifier -> users.authTokenIdentifier -> shopMembers -> shops
```

- `identity.tokenIdentifier` を auth-linked lookup のキーにする。
- 認可目的で `userId` を client から受け取らない。
- `shopId` は選択中店舗の指定であって、権限そのものではない。active な `shopMembers` と非削除 `shops` で検証する。
- billing-sensitive な処理では、UI非表示だけでなくサーバー側で billing 権限や entitlement を再確認する。
- 複数店舗ユーザーで「最初の所属店舗」に勝手にフォールバックすると危険な導線では、選択中 `shopId` を明示し、所属検証する。

### 店舗境界

`shopId` はテナント境界として扱う。
ID を受け取る public query / mutation は、対象ドキュメント取得後に `shopId`、関連ドキュメント、`isDeleted` を検証する。

- staff、recruitment、position、shift assignment、submission、notification、registration request、billing state、legal consent は店舗境界を越えない。
- 他店舗データ、削除済みデータ、存在しないデータは、原則として同じ失敗扱いに寄せる。
- Forbidden と Not found の区別が他店舗データの存在を漏らす場合は `Not found` に寄せる。
- UUID や token が推測困難でも、認可チェックは省略しない。

### スタッフ token / session 境界

スタッフは原則 Clerk アカウントを持たないため、magic link と staff session を別の認証境界として扱う。

- token / session はサーバー側で検証する。
- `staffId`、`shopId`、`recruitmentId`、`accessKind`、`expiresAt`、`usedAt`、`revokedAt` を用途に応じて確認する。
- staff、shop、recruitment を再取得し、非削除状態と相互の `shopId` 整合性を確認する。
- submit と view は別権限として扱い、片方の token / session で他方を実行できないようにする。
- token 検証や再発行のようなブルートフォース・メール爆撃につながる導線は rate limit する。

### 登録・招待・LINE連携・法務同意 token

Bearer token 型の導線は、漏れたらその権限を使える前提で扱う。

- token は十分ランダムで、店舗・対象者・用途にスコープする。
- TTL、`usedAt`、`revokedAt` を用途ごとに設計する。
- single-use が必要な導線では、使用済み token を拒否する。
- newest-only な再発行では、同じ scope の古い未使用 token を revoke する。
- manager 招待は、未認証共有リンクだけで管理権限を付与しない。ログイン後のサーバー側 identity / email / membership 照合を前提にする。

### 通知・LINE・Resend

通知配送は、シフト情報の漏洩と配送コスト・迷惑送信の両方のリスクを持つ。

- ユーザー操作で配送や再送を積む導線には、rate limit、dedupeKey、冪等性を持たせる。
- 二重クリックや再試行で同じ配送ジョブが過剰に積まれないようにする。
- 受付済み、予約済み、retrying、実配送成功を混同しない。
- LINE Webhook は署名検証後にだけ parse / DB mutation を行う。
- 外部APIエラーを client や manager UI に出す場合は、必要最小限に sanitize する。
- LINE URL のブラウザ制約がある導線では、既存の外部ブラウザ helper を使う。

### ログと個人情報

ログは障害調査と不正検知に必要だが、個人情報や token の漏洩源にもなる。

- 生 token、authorization header、Webhook body、secret、full email address をログに残さない。
- 必要なら email domain、ID、event type、status、reason などの安全な要約にする。
- 認証・認可失敗、rate limit、想定外の business flow は、調査できる範囲で記録する。
- third-party response body は PII や provider detail を含む可能性があるため、そのまま返したり保存したりしない。

## テスト方針

セキュリティ修正では、少なくとも unsafe implementation で落ちる regression test を検討する。

- Convex Function Test: public query / mutation 単体の未認証、権限不足、IDOR、削除済み、返却DTO、token状態、rate limit。
- Convex Scenario Test: 複数APIをまたぐ店舗境界、通知対象漏れ、staff session、dashboard、billing、登録/招待導線。
- UI / Storybook: セキュリティ挙動そのものではなく、ユーザーに見える確認文言やエラー表示が重要な場合に追加する。
- E2E: 実 frontend + 実 Convex backend + 認証の主要導線確認に限定する。

既存の横断セキュリティ観点は `convex/_scenario/securityBoundaries.test.ts` を最初に確認する。

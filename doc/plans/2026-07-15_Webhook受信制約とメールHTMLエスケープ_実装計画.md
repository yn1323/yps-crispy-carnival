# Webhook受信制約とメールHTMLエスケープ 実装計画

**ステータス：実装・対象検証完了**

**AI並列実装の目安：40〜55分**

③のWebhook受信制約と、④のメールHTMLエスケープだけを実装する。

更新後の`AGENTS.md`とスキルに合わせ、既存境界内の最小実装とする。

当初はE2Eを対象外としていたが、実装後の追加指示により既存E2Eを実行し、日付経過と同名prefixで失敗した2シナリオを安定化した。

---

## 1. 見直し結果

前回計画から、将来の誤用だけを理由にした抽象化と重複テストを削除する。

| 項目 | 前回計画 | 更新後 |
|---|---|---|
| Webhook body reader | 共通helperと専用helper test | 共通helperは残し、2つのHTTP境界テストで契約を確認 |
| LINE body上限 | 256 KiB | 1 MiB |
| Content-Type | charsetまで厳密に制限 | media typeが`application/json`であることだけを確認 |
| メールescape helper | 新規moduleにtext用とattribute用を分離 | `templates.ts`内のprivate関数1つ |
| LINE CTA | raw HTMLを構造化DTOへ変更 | 現在の内部生成経路を維持 |
| メールテスト | helper test、template test、Action Test | `templates.test.ts`だけを主担当にする |
| 回帰確認 | Convex Logic + Scenario | 変更対象のLogic Testだけ |

③のstreaming readerはLINEとResendで同じbyte境界を実装するため、実在する重複として共通化する。

④はメールHTML生成という単一境界に閉じるため、別moduleやwrapperを作らない。

---

## 2. 完成形

### 2.1 ③ Webhook受信制約

LINEとResendのWebhookは、署名検証前にContent-Typeとbody byte数を検査する。

`Content-Length`は早期拒否のヒントとしてだけ使い、request streamの実byte数を上限超過時点まで数える。

署名検証には、空白、改行、Unicodeを含む受信raw bodyを変更せずに渡す。

LINEはbody上限に加え、1リクエスト内のevent件数も制限する。

| route | Content-Type | body上限 | event上限 |
|---|---|---:|---:|
| `POST /line/webhook` | `application/json`、parameterは許容 | 1 MiB | 100件 |
| `POST /resend/webhook` | `application/json`、parameterは許容 | 64 KiB | root object 1件 |

これらはproviderの公開最大値ではなく、このアプリのローカル運用上限とする。

正常request、LINEの`events: []`、未知のLINE event type、対象外のResend eventは、従来どおり`200`で受理する。

### 2.2 ④ メールHTMLエスケープ

全10個のメールHTML builderで、動的なleaf値をHTMLへ埋め込む直前に1回だけエスケープする。

`templates.ts`内にprivateな`escapeEmailHtml`を置き、`&`、`<`、`>`、`"`、`'`をHTML entityへ変換する。

本文とdouble-quoted attributeに同じ安全側の変換を使い、context別helperは増やさない。

完成HTML、静的markup、DB値、件名、LINE text、Flex Messageはエスケープ対象にしない。

既存の`lineCtaHtml`は、現在の内部生成経路だけで使われているため維持する。

---

## 3. ③ Webhook受信制約

### 3.1 共通bounded reader

`convex/_lib/httpBody.ts`を追加する。

helperはContent-Type確認、bounded read、UTF-8 decode、raw text返却だけを担当する。

JSON parse、provider固有shape、HTTP response文言は各routeへ残す。

- [x] media typeを大文字小文字を無視して比較し、`application/json`だけを許可する。
- [x] `charset`などのparameterは許容する。
- [x] 有効な非負整数の`Content-Length`が上限を超える場合は、streamを読む前に拒否する。
- [x] 欠落または不正な`Content-Length`は信用せず、実streamのbyte数で判定する。
- [x] chunkの`Uint8Array.byteLength`を加算し、上限超過時にreaderを中止する。
- [x] 上限内のbyte列を`TextDecoder`のfatal modeでUTF-8 decodeする。
- [x] 返却前に`trim`、`JSON.parse`、再serializeを行わない。
- [x] raw body、署名、provider payloadを新たにログへ出さない。

### 3.2 LINE Webhook

`convex/constants.ts`へ1 MiBのbody上限と100件のevent上限を追加する。

`convex/line/webhook.ts`の処理順を次に固定する。

```text
secret設定確認
  -> Content-Typeとbounded body read
  -> raw bodyの署名検証
  -> JSON parse
  -> 最小shapeとevent件数の検証
  -> internal mutation
  -> 必要なreply action
```

最小shapeはroot object、`events`配列、各eventの`type: string`までとする。

`source.userId`と`replyToken`は型を確認して取り出し、event typeごとの詳細検証は既存のdispatch処理へ委ねる。

- [x] 正規のLINE requestのroute、署名方式、成功responseを維持する。
- [x] `events: []`を疎通確認として`200`で受理する。
- [x] 未知のevent typeを`200`で無視する。
- [x] 100 eventsを受理し、101 eventsを`413`で拒否する。
- [x] 拒否時にinternal mutation、scheduler、外部fetchを実行しない。

### 3.3 Resend Webhook

`convex/constants.ts`へ64 KiBのbody上限を追加する。

`convex/notificationOutbox/resendWebhook.ts`の処理順を次に固定する。

```text
secret設定確認
  -> Content-Typeとbounded body read
  -> raw bodyの署名検証
  -> JSON parse
  -> root objectの検証
  -> 既存normalize
  -> provider issue記録
```

深いschema検証は既存の`normalizeProviderIssue`へ委ねる。

- [x] 正規のResend requestの署名方式と成功responseを維持する。
- [x] 対象外eventを`200`、副作用なしで無視する。
- [x] 既存のtimestamp toleranceと`svix-id`重複排除を変更しない。
- [x] 拒否時にnotification eventとFailureInboxを作らない。

### 3.4 HTTP response契約

| 状態 | status | 副作用 |
|---|---:|---|
| Content-Typeなし、非JSON | `415` | なし |
| bodyまたはLINE event件数の超過 | `413` | なし |
| UTF-8不正、JSON不正、最小shape不正 | `400` | なし |
| 署名不正 | `401` | なし |
| 正常、LINE疎通確認、対象外event | `200` | 既存契約どおり |

不正または欠落した`Content-Length`自体は新しい`400`契約にせず、実byte数による判定へフォールバックする。

---

## 4. ④ メールHTMLエスケープ

### 4.1 実装境界

`convex/notification/templates.ts`へ次のprivate helperだけを追加する。

```ts
function escapeEmailHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
```

完成HTML全体ではなく、次の動的leafを補間直前に変換する。

| builder | text | attribute |
|---|---|---|
| `buildConfirmationEmailHtml` | `staffName`、`periodLabel`、shiftの`date`と`timeLabel` | `magicLinkUrl`、`reissueUrl` |
| `buildRecruitmentEmailHtml` | `staffName`、`periodLabel`、`deadline` | `magicLinkUrl` |
| `buildReminderEmailHtml` | `staffName`、`periodLabel`、`linkExpiresAtLabel` | `magicLinkUrl` |
| `buildLineInviteEmailHtml` | `staffName`、`shopName` | `authorizeUrl` |
| `buildStaffRegistrationOwnerDigestEmailHtml` | `managerName` | `dashboardUrl` |
| `buildNotificationFailureReminderEmailHtml` | `managerName` | `dashboardUrl` |
| `buildShopActivationReminderEmailHtml` | `managerName`、表示用`dashboardUrl` | `dashboardUrl` |
| `buildShiftConfirmationReminderEmailHtml` | `managerName`、`periodLabel`、`deadlineLabel` | `dashboardUrl` |
| `buildStaffLegalConsentEmailHtml` | `staffName`、`shopName`、`expiresAtLabel` | `consentUrl` |
| `buildReissueEmailHtml` | `staffName`、`periodLabel` | `magicLinkUrl` |

`bodyMessage`は`periodLabel`だけをescapeし、静的な`<br/>`を維持する。

`shiftRow`は`date`と`timeLabel`だけをescapeし、静的な`<tr>`を維持する。

LINE CTAは`authorizeUrl`だけをescapeし、既存のCTA markupを維持する。

### 4.2 `lineCtaHtml`の扱い

現在のproduction call chainは`buildLineCtaForStaff`から`buildLineCtaSection`を経由して各builderへ渡る内部経路だけである。

任意のpublic入力をraw HTMLとして渡す経路はないため、今回はDTO化、ブランド型、Action引数の変更を行わない。

この信頼境界が分かる短いコメントだけを補い、将来の誤用は今回の変更範囲へ持ち込まない。

### 4.3 実装チェックリスト

- [x] `templates.ts`内へprivate helperを1つ追加する。
- [x] 全10 builderの動的textとURLへ適用する。
- [x] `bodyMessage`、`shiftRow`、LINE CTAの動的leafへ適用する。
- [x] 各leafを1回だけescapeし、同じ値へhelperを重ねて呼ばない。
- [x] 確定メールのmagic linkと再発行link、再発行メールのmagic linkへ`rel="noreferrer"`を追加する。
- [x] DB、Action、Outbox payload型、LINE text、Flex Messageを変更しない。
- [x] 既存Outboxデータをmigrationまたは再生成しない。

---

## 5. 自動テスト計画

主担当はConvex LogicのFunction Testとpure testだけにする。

### 5.1 LINE HTTP Action

`convex/line/webhook.test.ts`を追加し、`t.fetch()`でHTTP境界を確認する。

- [x] 署名済み`events: []`を`200`で受理する。
- [x] 代表的なfollow eventを1件通し、internal mutationへの接続を確認する。
- [x] Content-Type不正を`415`で拒否する。
- [x] declared sizeまたは実bodyが1 MiBを超える場合を`413`で拒否する。
- [x] `Content-Length`に依存せず、実stream超過を拒否できることを確認する。
- [x] 100 eventsを受理し、101 eventsを`413`で拒否する。
- [x] 署名不正、JSON不正、shape不正を該当statusで拒否する。
- [x] 拒否前後のDB、scheduler、外部fetchを完全一致で比較する。

follow、unfollow、message replyの業務分岐は既存の`convex/line/mutations.test.ts`へ委ねる。

`t.fetch()`で`Content-Length`欠落や偽装streamを安定して再現できない場合だけ、readerのbyte境界を`convex/_lib/httpBody.test.ts`へ移し、route側の同じcaseを削る。

これは別テスト層の追加ではなく、同じConvex Logic層内で主担当を入れ替えるフォールバックとする。

### 5.2 Resend HTTP Action

`convex/notificationOutbox/resendWebhook.test.ts`を更新する。

- [x] 既存requestへ`Content-Type: application/json`を追加する。
- [x] Content-Type不正を`415`で拒否する。
- [x] 64 KiB超過を`413`で拒否する。
- [x] 署名済みの非object rootを`400`で拒否する。
- [x] 拒否時にnotification eventとFailureInboxが増えないことを確認する。
- [x] 既存の署名不正、対象外event、provider issue正常系を維持する。

timestamp、署名計算、body改ざんは既存の`resendWebhookSignature.test.ts`へ委ねる。

`svix-id`重複は既存のinternal mutation testへ委ねる。

### 5.3 メールHTML

`convex/notification/templates.test.ts`を更新する。

- [x] 全10 builderをtable-driven testへ含める。
- [x] dynamic textに攻撃文字列を渡し、raw tagが残らないことを確認する。
- [x] URLにattribute breakout文字列を渡し、quoteがentity化されることを確認する。
- [x] rawの`&`が1回の補間で`&amp;`になり、誤って二重escapeされないことを確認する。
- [x] 日本語、絵文字、URLの`?`、`=`、`%`、`#`を維持する。
- [x] bodyの`<br/>`、shiftの`<tr>`、CTAの`<table>`を静的markupとして維持する。
- [x] CTA内部では`authorizeUrl`だけがescapeされることを確認する。
- [x] 対象3リンクの`rel="noreferrer"`を確認する。

helper専用test、Action Test、Scenario Test、E2E、Storybook、VRTは追加しない。

---

## 6. 変更ファイル

### 6.1 新規

- `convex/_lib/httpBody.ts`
- `convex/line/webhook.test.ts`

`t.fetch()`でstream境界を安定して再現できたため、`convex/_lib/httpBody.test.ts`は追加していない。

### 6.2 更新

- `convex/constants.ts`
- `convex/line/webhook.ts`
- `convex/notificationOutbox/resendWebhook.ts`
- `convex/notificationOutbox/resendWebhook.test.ts`
- `convex/notification/templates.ts`
- `convex/notification/templates.test.ts`
- `doc/features/line-notification.md`
- `doc/features/notification-outbox.md`
- `convex/_generated/api.d.ts`（Convex CLIによる自動生成）
- `convex/testing.ts`
- `e2e/pages/NotificationFailureDialogPage.ts`
- `e2e/scenarios/dashboard-pagination.test.ts`
- `e2e/scenarios/notification-failure-recovery.test.ts`

### 6.3 変更しない

- `convex/http.ts`
- `convex/schema.ts`
- `convex/_lib/lineCta.ts`
- `convex/notification/actions.ts`
- `convex/notification/reminderActions.ts`
- `src/`

---

## 7. Security Lens

- **Actor**：正規のLINE・Resend senderと、インターネット上の未信頼request送信者。
- **Asset**：Actionの処理容量、店舗データ、FailureInbox、メール内のmagic linkと管理画面link。
- **Trust boundary**：Webhookのraw byte列と、DB・外部入力をメールHTMLへ埋め込む境界。
- **Abuse case**：巨大body、event配列による増幅、署名対象bodyの改変、tag・attribute breakout。
- **Server-side check**：body byte数、event件数、署名、最小shape、HTML leaf escapeをserver側で確認する。
- **Idempotency**：Resendの既存`svix-id`重複排除を維持する。
- **Known gap**：LINEの`webhookEventId`重複排除はschema、保持、pruneを伴う別タスクとして残す。
- **Logs / PII**：raw body、署名、provider payload、magic link、完成HTMLを新たにログへ出さない。

---

## 8. 検証コマンド

変更対象のLogic Testを先に実行する。

```bash
pnpm vitest --project='convex(logic)' \
  convex/line/webhook.test.ts \
  convex/notificationOutbox/resendWebhook.test.ts \
  convex/notification/templates.test.ts
```

次にConvex Logic全体と静的検査を実行する。

```bash
pnpm test:convex:logic
pnpm type-check
pnpm lint
```

`pnpm lint`はCodex sandbox内でIPC errorになりやすいため、最初から権限付きで実行する。

当初はScenario TestとE2Eを対象外としていたが、実装後の追加指示により既存suiteも確認する。

### 8.1 実行結果

- targeted Convex Logic Test：3ファイル、37テスト成功。
- Convex Logic Test全体：60ファイル、679テスト成功。
- Frontend Logic Test全体：65ファイル、429テスト成功。
- UI Test全体：104ファイル、376テスト成功。
- Convex Scenario Test全体：14ファイル、43テスト成功。
- `pnpm type-check`：成功。
- `pnpm lint`：Biome 1,024ファイルとConvex timezone checkが成功。
- `pnpm test`：全project同時実行では2回ともConvex Logicの先頭付近で5秒timeoutしたが、失敗した各ファイルと各projectの単独実行は全件成功した。
- `pnpm e2e`：65件中63件成功。失敗したダッシュボードpaginationと通知不達リカバリーを修正し、各対象シナリオをsetup込みで再実行して4件ずつ成功した。全65件は修正後に再実行していない。
- 独立コードレビュー：重大な指摘なし。
- Storybook、VRT：未実行。

---

## 9. 工数

| 作業 | AI実装工数 |
|---|---:|
| ③ bounded reader、2 route、Function Test、機能doc | 35〜50分 |
| ④ 10 builder、table-driven test | 25〜35分 |
| ③と④を別agentで並列実装し、最後に共通検証・レビュー | **40〜55分** |
| 1 agentで順番に実装 | 60〜80分 |

並列時は、③と④の実装とテスト作成を同時に進め、`type-check`、`lint`、全Logic Test、最終レビューだけを合流後に1回実行する。

③でcustom request streamのテストfixtureまたはreader直接testへの切り替えが必要な場合だけ、追加で最大10分を見込む。

④は前回の新規module、CTA DTO化、Action Testを削ったため軽くなった。

全体時間は、raw bodyを保ったstreaming byte制限と拒否時副作用ゼロのHTTPテストが必要な③で決まる。

---

## 10. 完了条件

- [x] LINEとResendのbodyが実byte数でbounded readされる。
- [x] raw bodyを変更せずに署名検証へ渡す。
- [x] LINEのevent件数を100件以下に制限する。
- [x] 不正requestでDB、scheduler、外部fetchの副作用が起きない。
- [x] 全10メールbuilderの動的textとattributeがescapeされる。
- [x] 通常のメール表示、静的markup、link先の意味を維持する。
- [x] DB migrationが不要であり、新規Convex moduleを含むcodegen結果が反映されている。
- [x] targeted test、Convex Logic Test、型検査、lintが成功する。
- [x] 最終差分をsecurity、重複、不要な複雑さの観点でレビューする。
- [x] E2E全体実行で見つかった2件を修正し、対象シナリオを再実行する。
- [x] 機能ドキュメントが実装後のWebhook契約と一致する。

---

## 11. 参考ファイル

- `AGENTS.md`
- `.agents/skills/shiftori-coding/SKILL.md`
- `.agents/skills/shiftori-security-review/SKILL.md`
- `.agents/skills/convex-design-review/SKILL.md`
- `.agents/skills/test-strategy/SKILL.md`
- `convex/_generated/ai/guidelines.md`
- `convex/AGENTS.md`
- `doc/rules/testing-strategy.md`
- `doc/rules/security-strategy.md`
- `doc/rules/convex-design-strategy.md`
- `convex/http.ts`
- `convex/line/webhook.ts`
- `convex/_lib/lineSignature.ts`
- `convex/line/mutations.test.ts`
- `convex/notificationOutbox/resendWebhook.ts`
- `convex/notificationOutbox/resendWebhook.test.ts`
- `convex/_lib/resendWebhookSignature.ts`
- `convex/notification/templates.ts`
- `convex/notification/templates.test.ts`
- `convex/_lib/lineCta.ts`
- `doc/features/line-notification.md`
- `doc/features/notification-outbox.md`
- [LINE Webhook signature verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- [LINE Webhook receiving and redelivery](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [Resend Webhooks introduction](https://resend.com/docs/webhooks/introduction)
- [Resend Webhook signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests)

# LINE通知の設定と運用

> 文書種別: manual
>
> 対象: LINE Login、Messaging API Webhook、PushとReplyの運用
>
> 機能概要: [LINE通知連携](../features/line-notification.md)

LINE通知は、LINE Login、Webhook、Push API、Reply APIという複数の外部境界を持つ。
設定変更や障害調査では、対象deploymentとLINE channelを固定し、secretを記録せずに確認する。

## 事前条件

対象作業の前に、次を確認する。

- 対象のConvex deploymentを完全修飾名で特定している。
- LINE Login channelとMessaging API channelの組合せを特定している。
- callback URL、Webhook URL、アプリの公開URLが同じ環境を向いている。
- 作業結果を記録するアクセス制限済みの証跡保存先がある。

developmentとproductionの設定を同じ証跡や変数値として扱わない。
本番反映の状態は[リリース状態](release-status.md)へ記録する。

## 環境変数

| 変数 | 用途 |
|---|---|
| `LINE_LOGIN_CHANNEL_ID` | LINE Loginの認可URLを組み立てる |
| `LINE_LOGIN_CHANNEL_SECRET` | OAuth codeをtokenへ交換する |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | Push、Reply、quota取得に使う |
| `LINE_MESSAGING_CHANNEL_SECRET` | Webhook署名を検証する |
| `LINE_COMMON_LINK_CANONICAL_READS` | `enabled`と完全一致する場合だけ、組織人物単位のLINE正本を読む。未設定とほかの値は互換用の店舗投影だけを読む |
| `LINE_COMMON_LINK_CANONICAL_READY` | `enabled`と完全一致する場合だけ、二店舗目と既存人物の複数店舗所属を許可する |

`pnpm convex:env:setup`は、LINEのsecretを含む先頭4変数を同期しない。
二つのrollout変数はallowlistに含むが、Productionではこのcommandを使わず、対象deploymentを完全修飾したDashboardまたはCLIで個別に設定する。
LINE用のsecretは、Convex Dashboardまたは完全修飾deployment名を指定したCLIで個別に設定する。
CLIでは値を引数へ書かず、次のように対話入力する。

```bash
pnpm exec convex env set --deployment <fully-qualified-deployment> LINE_LOGIN_CHANNEL_ID
pnpm exec convex env set --deployment <fully-qualified-deployment> LINE_LOGIN_CHANNEL_SECRET
pnpm exec convex env set --deployment <fully-qualified-deployment> LINE_MESSAGING_CHANNEL_ACCESS_TOKEN
pnpm exec convex env set --deployment <fully-qualified-deployment> LINE_MESSAGING_CHANNEL_SECRET
```

設定後は、値を表示せずキー名だけを確認する。

```bash
pnpm exec convex env list --names-only --deployment <fully-qualified-deployment>
```

値をterminal出力、shell履歴、文書、issue、Pull Requestへ貼り付けない。

LINE Login設定がない場合、通知メール内のLINE連携CTAは省略される。
一方、管理画面のLINE連携操作を隠す全体feature gateはなく、既存のLINE連携状態も環境変数の有無だけでは解除されない。
Messaging API設定がないまま既存連携先へのLINE送信を受け付けるとworkerが失敗し得るため、LINE機能を使うdeploymentでは4変数を一組で設定する。

二つのrollout変数は別の責務を持つ。
`LINE_COMMON_LINK_CANONICAL_READS`は通知、画面、Outboxの読取正本をdeployment全体で切り替える。
`LINE_COMMON_LINK_CANONICAL_READY`は複数店舗の書込みを開くだけであり、読取正本を切り替えない。
どちらも値の前後空白を除いた結果が`enabled`の場合だけ有効となる。

## 組織共通LINE連携の段階切替

既存の`staffLineAccounts`があるdeploymentでは、次の順序を固定する。
画面非表示だけで複数店舗を閉じず、server-side guardが閉じていることも確認する。

1. 対象artifactのSHAと完全修飾deployment名を記録し、変更前のexportまたはbackupを取得する。
2. exportへ`pnpm convex:verify-line-common-readiness -- --path <export.zip>`を実行する。`ok: false`または`rolloutPath: blocked`なら停止する。
3. `LINE_COMMON_LINK_CANONICAL_READY`と`LINE_COMMON_LINK_CANONICAL_READS`を未設定のままWiden版を反映する。既存LINE通知は互換用の店舗投影を読み、新しい連携は組織人物正本と互換投影へ書く。
4. counterpart欠損がある`staged`経路だけ、専用runnerを最初は`dryRun`で実行する。完全ゼロ経路では実行しない。
5. 実変換後はmigration componentのstatusと、export verifier、全ページのbounded readiness queryを別々に確認する。
6. 旧token、旧scheduled caller、世代snapshotのない処理中LINE Outboxが0件になるまで、互換readとdual-writeを維持する。
7. `LINE_COMMON_LINK_CANONICAL_READS=enabled`を設定した版へ切り替え、通知、Webhook fan-out、Analytics、人物詳細と店舗詳細を確認する。この時点でも`LINE_COMMON_LINK_CANONICAL_READY`は開かない。
8. canonical不整合、`actionRequired` fan-out、旧非同期caller、互換Outboxがすべて0件であることを再確認してから、`LINE_COMMON_LINK_CANONICAL_READY=enabled`で複数店舗を開く。

専用backfillは固定migration seriesへ含まれない。
対象deploymentを完全修飾し、次のrunnerだけを使う。

```bash
pnpm exec convex run migrations/index:runLineCommonLinkBackfill \
  '{"dryRun":true}' \
  --deployment <fully-qualified-deployment>

pnpm exec convex run migrations/index:runLineCommonLinkBackfill \
  '{}' \
  --deployment <fully-qualified-deployment>

pnpm exec convex run --component migrations lib:getStatus \
  --deployment <fully-qualified-deployment>
```

Productionの変数変更、backfill実行、deployは、それぞれ対象と直前のreadinessを示して明示承認を得てから行う。
`canonical reads`へ切り替えた後に旧readへ戻すのは、dual-writeが継続し、互換投影の完全一致を確認できる間に限る。
legacy writeを停止した後は、canonical側を修復するforward recoveryだけを行う。

## Provider側の設定

LINE Loginのcallback URLは、アプリの`/line/callback`へ設定する。
Messaging APIのWebhook URLは、対象Convex deploymentの`/line/webhook`へ設定する。

設定後は、対象deploymentのURLとchannelの組合せを証跡へ記録する。
channel secretやaccess tokenは記録しない。

## Webhookの受入条件

`POST /line/webhook`は、署名検証に成功したrequestだけを状態変更へ渡す。
parameter付きの`application/json`を受け付け、raw bodyを1 MiB、`events`を100件までに制限する。

`Content-Length`は早期拒否に使い、request streamから読んだ実byte数も検査する。
上限内のraw bodyを変更せずにHMAC署名を検証し、その後でJSONをparseする。

`events: []`と未知のevent typeは疎通確認として受理する。
eventがある場合は`webhookEventId`とprovider timestampを必要とする。

followとunfollowは、保存済みtimestamp以前のeventと同じevent IDの再送を無視する。
messageはReply APIより前にevent IDをreceiptとしてclaimし、同じ署名済みeventの再送でReply APIを繰り返さない。

receiptにはreply token、LINE user ID、message ID、本文を保存しない。
受信から30日後を期限とし、日次処理が100件ずつ削除する。

## 試行上限

| 制限 | 上限 | 目的 |
|---|---:|---|
| `lineLinkRedeemGlobal` | 100回/分 | state lookup前の匿名callbackを全体で抑止する |
| `lineLinkRedeem` | 5回/分 | 存在する有効stateへの試行を抑止する |
| `lineWebhook` | 100回/分 | message replyだけを抑止する |
| `lineInviteShort` | 1回/分 | 同じ店舗、スタッフへの連携依頼の連打を抑止する |

OAuth callbackには信頼できる利用者identityや送信元IPがない。
存在しないstateと無効なstateは固定global bucketへ集約し、存在する有効stateはtokenごとのbucketで制限する。
無効stateへの集中で、有効なcallbackまでglobal上限へ巻き込まない。

送信元単位の制限へ変える場合は、trusted proxyとheader上書きの契約を先に定める。
利用者が指定できるIP headerを単独の信頼根拠にしない。

## 日常確認

Outbox workerが送信直前に保存済みquotaの超過を確認した場合、通知payloadにfallback用メールがあればメールを別jobとして追加する。
fallback用メールがないLINE通知は失敗となる。
LINE APIの429は別の再試行規則で扱い、通常のLINE通知では最終失敗だけを理由にメールへ切り替えない。
現行の管理者招待はメールだけでenqueueする。
legacyまたは互換用の管理者招待LINE payloadをworkerが処理する場合に限り、LINE providerへの送信が終端失敗したときにメールへfallbackする。
外部送信の状態、retry、最終失敗、payload redactionは[Notification Outbox](../features/notification-outbox.md)で確認する。

障害調査では、次を順に切り分ける。

1. 対象組織人物の連携が有効で、友だち状態が有効か確認する。
2. LINE quotaが`normal`か`exceeded`か確認する。
3. Outboxが`pending`、`processing`、`sent`、`failed`、`cancelled`のどこにあるか確認する。
   `final_failed`はDeliveryEventの種別であり、Outboxのstatusではない。
4. Webhook signature、event ID、timestampの拒否が発生していないか、安全なerror codeで確認する。
5. LINE provider障害とアプリ側の入力拒否を分ける。

raw provider response、authorization header、LINE user ID、token、スタッフのメールアドレスをlogや証跡へ残さない。

## 回復手順

連携URLの期限切れまたは使用済みでは、新しいURLを発行する。
再発行すると以前の未使用tokenは失効するため、古いQRを案内し続けない。

unfollow後はメール通知へ切り替わる。
再度followされた場合はWebhookで、同じLINE利用者へ明示連携した全組織人物と、その全所属店舗の状態を再開可能なjobで更新する。

保存済みquotaの超過ではLINEを無理に再送せず、fallback用メールの有無と、別jobが追加されたかを確認する。
LINE APIの429ではOutboxの再試行回数と最終失敗を確認する。
Webhookの署名検証やbody上限を緩めて復旧しない。

Messaging API tokenまたはchannel secretの漏洩が疑われる場合は、provider側でrotationし、対象deploymentの環境変数を更新する。
rotation前後の値は記録せず、実施日時、対象channel、対象deployment、疎通結果だけを証跡へ残す。

## 変更後の確認

コードまたは設定を変えた場合は、次の境界を変更範囲に応じて確認する。

- 無効署名、body上限、event件数上限ではDB更新と外部callが増えない。
- 同じevent IDの再送ではmessage budgetとReply APIを重複消費しない。
- token再発行後は最新tokenだけが使える。
- チャネル選択時にquota超過が判明している場合、未連携、unfollowではメールを選ぶ。
- Outbox送信直前にquota超過が判明した場合、fallback用メールがある通知だけをメールへ切り替える。
- 同じ組織人物の全所属店舗が一つの連携を共通利用し、別組織には連携を自動作成していない。
- 友だち解除と再追加が、同じLINE利用者へ明示連携した全組織人物へ反映され、fan-out jobが`actionRequired`に残っていない。
- Outboxの再試行とredactionを迂回していない。

実環境確認には、exact commit SHA、完全修飾deployment名、LINE channelの識別可能な名称、実施日時、結果、アクセス制限済み証跡を記録する。

## 参照先

- `doc/features/line-notification.md`
- `doc/features/notification-outbox.md`
- `doc/rules/security-strategy.md`
- `doc/rules/convex-design-strategy.md`
- `convex/line/`
- `convex/http.ts`
- `convex/crons.ts`

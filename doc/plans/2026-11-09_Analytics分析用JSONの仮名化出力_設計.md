# Analytics分析用JSONの仮名化出力

> 状態: 設計案（実装前の確認待ち）
>
> 作成日: 2026-11-09

内部Analyticsから、店舗・組織の利用状況を仮名化したJSONで出力し、外部のAIに読ませて傾向を分析できるようにする。  
最初の問いは「募集の提出方法（時間指定・日付選択・パターン選択）が、提出・確定・継続利用と関係しているか」である。

同じ変更で、店舗一覧の直近シフトと店舗詳細の募集一覧に、募集を作成した時点の提出方法を表示する。  
この表示は個人情報を増やさないため、この設計の確認を待たずに実装した。

## 出力の種類と入口

3つの入口は同じschemaのJSONを出力し、`scope`だけが異なる。  
AIへの指示文を入口ごとに変えずに済むようにする。

| 入口 | 出力の対象 |
|---|---|
| 店舗一覧の「JSONを出力」 | 今の絞り込み条件に合う全店舗。表示中のページに限らない |
| 組織一覧の「JSONを出力」 | 今の絞り込み条件に合う全組織と、その全店舗 |
| 組織一覧の各行 | その組織と全店舗 |
| 店舗詳細 | その店舗と所属組織の概要 |

一覧の出力は、未読のページを最後まで読んでから店舗ごとの詳細を取得する。  
進捗（`12/80店舗`）と中止ボタンを表示し、取得できなかった店舗は件数と理由をJSONに残す。

## 仮名化のルール

> 2026-11-14の変更: 仮名（`A組織`、`A-A店舗`、`人物001`）をやめ、組織、店舗、スタッフ、ユーザーをDBのIDで出力する。  
> 別のファイルやConvex Dashboardと照合できるようにするためである。  
> この節より下の`label`、`person`、仮名の記述は、次の表のIDに読み替える。

JSONには実名、メールアドレス、自由記述を入れない。内部IDは次の表のものだけを入れる。

| 対象 | 出力 | 内容 |
|---|---|---|
| 組織 | `organizationId` | DBの組織ID。別のファイルでも同じ組織は同じIDになる |
| 店舗 | `shopId`、`organizationId` | DBの店舗IDと、所属組織のID |
| スタッフ | `staffId` | DBのスタッフID。店舗ごとに振られるため、同じ人でも店舗が違えば別のIDになる |
| ユーザー | `userId` | ログイン用アカウントのID。アカウント未連携のスタッフは`null` |
| 同じ人物の照合 | `personKey` | 正規化済みのメールアドレスが同じスタッフのうち、最も古いスタッフのID。店舗・組織をまたいで同じ値になる |
| 募集 | 識別子なし | 店舗ごとに期間で識別する |

メールアドレスによる同一人物の判定はConvex側で行い、ブラウザへはメールアドレスを返さない。  
メールアドレスのhashは辞書攻撃で戻せるため使わない。  
現在在籍していないスタッフの提出は、`staffId`と`personKey`を`null`にして数える。

IDと名称の対応表は、出力後の画面にだけ表示する。  
ファイル、URL、localStorageには保存せず、画面を離れると破棄する。AIが店舗IDを挙げた時に、本人が実際の店舗を確認するために使う。

## 入れない情報

出力はallowlist方式で組み立て、次の情報は返却DTOの型に持たせない。

- 組織名、店舗名、人物名、招待名、請求先メールアドレス、スタッフのメールアドレス
- パターン選択のパターン名（店舗が自由に付ける名前のため、時間帯と件数だけを出す）
- 希望シフトの日付メモ、要望の本文、通知の本文、取消理由の自由記述
- 上の表にないConvexの内部ID、Stripe・Resend・LINEの識別子、token
- 削除済みの店舗・組織・人物の情報

## 載せる情報

時刻はJSTのISO 8601（`2026-09-01T10:15:00+09:00`）、業務日付は`YYYY-MM-DD`で出す。  
値がないことと0を区別し、記録がない値は`null`にする。走査の上限で数を確定できない場合は`isTruncated: true`を付ける。

### ファイル全体

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-11-09T10:00:00+09:00",
  "timezone": "Asia/Tokyo",
  "scope": {
    "kind": "shopList",
    "filters": { "billing": "trial", "notified": true, "multiStaff": true, "attention": false, "hasNameSearch": true }
  },
  "definitions": { "submissionPattern.time": "時間指定。スタッフが日付ごとに開始・終了時刻を提出する" },
  "counts": { "organizations": 3, "shops": 5, "people": 42, "skippedShops": 1 },
  "skipped": [{ "reason": "deleted" }],
  "organizations": [],
  "shops": []
}
```

`definitions`には、提出方法、契約状態、要注意、LINEの状態など、AIが値の意味を読み違えやすい項目の説明を入れる。  
名称の検索語は実名を含みうるため、`hasNameSearch`の有無だけを出す。

### 組織

| 項目 | 内容 | 分析での使い道 |
|---|---|---|
| `label` | `A組織` | 店舗との対応 |
| `registeredOn` | 登録日 | 利用期間 |
| `billing` | 契約状態、現在のプラン、変更先、トライアル終了日・変更予定日 | 課金への転換 |
| `peopleCount` / `managerCount` / `shopCount` | プラン上限と同じ数え方の人数、管理者数、店舗数 | 組織の規模 |
| `lastNotifiedAt` | 取消以外の通知を最後に受け付けた日時 | 現在も使っているか |

### 店舗

| 項目 | 内容 | 分析での使い道 |
|---|---|---|
| `label` / `organization` | `A-A店舗`、`A組織` | 組織との対応 |
| `registeredOn` | 登録日 | 利用期間 |
| `settings.submissionPattern` | 現在の提出方法。時間指定は開始・終了時刻、パターン選択はパターン数と各時間帯 | 設定と利用の関係 |
| `settings.regularClosedDays` | 定休日の曜日 | 業態の手がかり |
| `staff` | スタッフ数、管理者数、シフト対象外、アカウント連携、LINE連携済みの人数 | 規模とLINE定着 |
| `usage.lastActivityDate` | 計測開始後に提出・確定を記録した最終日 | 継続利用 |
| `usage.attention` | 要注意の理由（次の募集がない、14日以上利用なし） | 離脱の兆候 |
| `usage.activeDays` | 直近90日で提出・確定があった日付 | 利用の頻度と周期 |
| `recruitments` | 直近8件の募集（下記） | 提出方法ごとの比較 |
| `members` | スタッフごとの仮名と状態（下記） | 人物単位の参加 |

### 募集

| 項目 | 内容 |
|---|---|
| `periodStart` / `periodEnd` / `periodDays` | 募集期間と日数 |
| `deadline` / `daysFromDeadlineToStart` | 提出期限と、期限から期間開始までの日数 |
| `createdAt` / `daysFromCreatedToDeadline` | 募集の作成日時と、作成から期限までの日数 |
| `status` / `confirmedAt` / `confirmedBeforeStart` | 確定の有無、確定日時、期間開始前に確定したか |
| `submissionPattern` | 募集を作成した時点の提出方法（パターン名は除く） |
| `shopClosedDateCount` / `editCount` | 期間内の休業日数、募集の編集回数 |
| `reminder` | 自動催促の予定と送信日時 |
| `submission` | 提出人数、期限までに提出した人数、最後に提出数を更新した時点のシフト対象人数 |
| `assignment` | 割当がある人数と割当の件数。上限を超えたら`isTruncated` |
| `submissions` | 人物ごとの初回・最終提出日時、再提出待ちか、割当があるか |

### 店舗のメンバー

| 項目 | 内容 |
|---|---|
| `person` | `人物001`。同じメールアドレスなら他の店舗・組織でも同じ |
| `isManager` / `excludedFromShift` | 管理者か、シフト対象外か |
| `accountLinked` / `line` | アカウント連携の有無、LINE連携の状態 |
| `joinedOn` | 店舗へ登録された日 |

## 取得方法

既存のBFFとConvex HTTP Actionの経路に、閲覧専用のendpointを2つ追加する。

| method | BFF path | Convex endpoint | 返すもの |
|---|---|---|---|
| `GET` | `/api/analytics/export/shops/:shopId` | `shopExport` | 1店舗の出力データ。人物は照合キーで返す |
| `GET` | `/api/analytics/export/organizations/:organizationId` | `organizationExport` | 組織の概要と現在の店舗ID（最大100件） |

返却DTOは、ブラウザで仮名へ置き換えるための店舗ID・組織ID・照合キーを含む。  
実名の対応表を画面に出すため、店舗名・組織名は返すが、人物名とメールアドレスは返さない。

1回の読み取りは次の上限に収める。上限で打ち切った場合は、その項目に`isTruncated`を付ける。

| 対象 | 上限 |
|---|---|
| スタッフ | 1店舗200人（既存の店舗一覧と同じ） |
| 募集 | 直近8件 |
| 募集ごとの提出 | 201件 |
| 募集ごとの割当 | 600件 |
| 利用日 | 直近90日 |

レスポンスは既存と同じく512KB未満に制限する。  
一覧の出力は同時に2件まで取得し、rate limit（毎分120回）の`429`では`retry-after`だけ待って再開する。  
認証切れでは取得済みのデータと対応表を破棄して中断する。

## Security Lens

- **Actor**：Cloudflare Accessで本人確認した運営者だけ。BFFがservice credentialでConvexを呼ぶ。
- **Asset**：スタッフ・管理者の氏名とメールアドレス、組織・店舗名、日付メモ、利用の時系列。
- **Trust boundary**：Convex → BFF → ブラウザのメモリ → 保存したファイル → 外部AI。ファイル以降は運営者の管理外になる。
- **Abuse case**：
  - 将来の項目追加で実名・自由記述がファイルへ混ざる。
  - パターン名など、店舗が自由に入力する値に人名が含まれる。
  - メールアドレスのhashから本人を推測される。
  - 対応表がlocalStorageやURLに残る。
  - 走査上限で欠けたデータを全件として分析する。
- **Server-side enforcement**：出力用DTOとreturns validatorを名前・メールアドレス・自由記述のない型に限定する。店舗・組織の現在状態と所属を確認してから返す。
- **Rate limit / idempotency**：既存のservice用token bucketを共用する。閲覧のみで状態を変えない。
- **Lifecycle / recovery**：ファイルはブラウザで組み立てて保存する。サーバーに出力結果も対応表も保存しない。
- **Logs / PII**：出力内容、照合キー、店舗名をログへ出さない。失敗時はendpoint名と安全なrequest IDだけを記録する。
- **Regression test**：Convex Function testで、人物名・メールアドレス・店舗名・組織名（DTO外）・パターン名・日付メモが`shopExport`の返り値に含まれないこと、別組織の同じメールアドレスが同じ照合キーになること、違うメールアドレスが別のキーになること、削除済み・所属不整合のスタッフを返さないこと、上限での`isTruncated`を確認する。HTTP Actionのschema testで新しいendpointの入力検証を確認する。

## 文書と規約の更新

`apps/analytics-dashboard/AGENTS.md`の「集計とJSONLは匿名の数値・計測状態に限定する」を、分析用JSONの例外を含む形へ改める。  
例外は「仮名化した業務データ。氏名、メールアドレス、自由記述、内部ID、tokenは含めない」に限る。  
`doc/features/analytics-dashboard.md`に出力の入口、項目、仮名化のルールを追記する。

## 確認したいこと

1. 仮名と実名の対応表を、出力後の画面にだけ表示してよいか。ファイルに入れない方針で問題ないか。
2. 仮名をファイルごとに振る方針でよいか。別ファイルどうしで仮名をそろえる場合は、サーバー側で安定した仮名を管理する必要がある。
3. 募集を直近8件、利用日を直近90日に絞ってよいか。全期間にすると大きな店舗で読み取り上限に達する。

## 参考にしたファイル

- `apps/analytics-dashboard/AGENTS.md`、`doc/features/analytics-dashboard.md`
- `doc/rules/security-strategy.md`、`.claude/skills/shiftori-security-review/references/review-checklist.md`
- `convex/schema.ts`（`shops`、`organizations`、`organizationPeople`、`staffs`、`recruitments`、`shiftSubmissions`、`shiftAssignments`、`recruitmentStats`、`analyticsShopDays`）
- `convex/_lib/submissionPattern.ts`
- `convex/analyticsDashboard/queryHelpers.ts`、`convex/analyticsDashboard/queries.ts`、`convex/analyticsDashboard/dto.ts`、`convex/analyticsDashboard/validators.ts`
- `convex/analyticsDashboard/httpActions.ts`、`convex/analyticsDashboard/schemas.ts`、`convex/_lib/rateLimits.ts`
- `apps/analytics-dashboard/src/server/analyticsRoutes.ts`、`apps/analytics-dashboard/src/pages/OverviewPage.tsx`（既存のJSONL出力）
- `apps/analytics-dashboard/src/pages/ShopsPage.tsx`、`apps/analytics-dashboard/src/pages/OrganizationsPage.tsx`、`apps/analytics-dashboard/src/pages/ShopDetailPage.tsx`

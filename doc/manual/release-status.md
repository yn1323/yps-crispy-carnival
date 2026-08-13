# リリース状態

> 最終更新: 2026-08-13
>
> 実環境確認: 未確認

この文書は、Productionの公開、deployment、migration、外部サービス設定を、実環境の証跡とともに記録する正本です。
リポジトリ内の実装、テスト成功、計画書の記述だけでは、実環境へ反映済みとは判定しません。

## 現在の確認状態

2026-08-13時点で、この文書へ必要な実環境証跡は登録されていません。
次の状態はすべて**未確認**です。

| 確認対象 | 状態 | 最終確認日時 | 対象環境・deployment | 証跡 |
|---|---|---|---|---|
| Productionのフロントエンドartifactとcommit SHA | 未確認 | 未確認 | 未確認 | 未登録 |
| ProductionのConvex deployとcommit SHA | 未確認 | 未確認 | 未確認 | 未登録 |
| Productionのmigration seriesと各migrationの完了 | 未確認 | 未確認 | 未確認 | 未登録 |
| LINE共通化のProduction export判定、m041の実行要否と完了、全ページreadiness | 未確認 | 未確認 | 未確認 | 未登録 |
| `LINE_COMMON_LINK_CANONICAL_READS`の切替と、旧token・Outbox・scheduled callerのdrain | 未確認 | 未確認 | 未確認 | 未登録 |
| `LINE_COMMON_LINK_CANONICAL_READY`による複数店舗公開と、切替後canary | 未確認 | 未確認 | 未確認 | 未登録 |
| 組織作成、課金、管理者招待を常時利用可能にするartifactと、旧feature flag環境変数に依存しないこと | 未確認 | 未確認 | 未確認 | 未登録 |
| 新規組織の2暦月Trial、未契約・利用停止後のデータ保持と利用制限 | 未確認 | 未確認 | 未確認 | 未登録 |
| StripeのPro・Business公開設定、Price、明示された税区分、Webhook | 未確認 | 未確認 | 未確認 | 未登録 |
| `/commercial-transactions`の事業者名、運営責任者、所在地、電話番号、Pro・Business販売価格の確定情報への置換 | **要対応（仮入力）** | 2026-08-13 | Repository | `src/components/features/CommercialTransactions/index.tsx`の`MANUAL_BUSINESS_DETAILS`と`MANUAL_SALES_PRICES` |
| Resendの`email.delivered` Webhook | 未確認 | 未確認 | 未確認 | 未登録 |
| Clerk、Cloudflare、Stripeのセキュリティ設定とprovider canary | 未確認 | 未確認 | 未確認 | 未登録 |
| 公開Web計測のGTM container、GA4 property、Clarity、Consent、Production request | 未確認 | 未確認 | 未確認 | 未登録 |
| `ENV-CLERK-02`のログイン方法・シフト連絡先分離canary | 未確認 | 未確認 | 未確認 | 未登録 |
| `verifyStaffs.activeStaffPersonEmailMismatch`の全ページ合計0件 | Development確認済み・Production未確認 | 2026-08-04 09:18 JST | `dev:fortunate-mallard-809` | 本文のDevelopment確認記録 |

「未確認」は未実施を意味しません。
この文書に、対象と時刻を特定できる証跡がまだないことを表します。

`/commercial-transactions`は、仮入力を含む現状のままProductionへ公開しません。
事業者名、運営責任者、番地まで含む所在地、確実に連絡できる電話番号、Pro・Businessの月額料金と税込・税別へ置換し、表示、連絡可能性、Stripe Priceとの一致を確認してから状態を更新します。

## 記録に必要な情報

一つの確認記録に、次を揃えます。

- 確認日時とタイムゾーン。
- 確認者。
- 対象commit SHAと、デプロイしたartifactの識別子。
- Production、Develop、Previewなどの環境名。
- Convexでは完全修飾deployment名と、CLIが表示した実行対象。
- 実行したコマンドまたは外部管理画面で確認した項目。
- 成功、要対応、未確認の判定と、その根拠。
- アクセス制限されたログ、export、Pull Request、管理画面記録などの証跡。
- 失敗時の停止位置、復旧先、再確認条件。

秘密値、個人情報、token、Webhook URLは記録しません。

ログイン方法とシフト連絡先の分離を公開する前に、対象となる完全修飾Convex deploymentで`narrowReadiness/queries:verifyStaffs`を`isDone: true`まで全ページ実行し、`activeStaffPersonEmailMismatch`の合計が0件であることを記録します。  1件以上の場合は公開を停止し、連絡先を推測して修復せず、別のmigration判定へ分けます。

LINE共通化を公開する前は、対象Production exportの`convex:verify-line-common-readiness`結果、`migrations/index:runLineCommonLinkBackfill`の実行またはskip根拠、LINE共通化readiness全ページ、旧非同期callerのdrainを別々に記録します。  canonical reader切替と複数店舗公開も別の証跡とし、ローカルテストやrepository実装から完了を推測しません。

## 確認記録の様式

確認ごとに、次の節を複製して追記します。

```md
### YYYY-MM-DD HH:mm TZ：確認対象

- 状態: 確認済み | 要対応 | 未確認
- 確認者:
- 環境:
- 完全修飾deployment名:
- commit SHA:
- artifact:
- 実行または確認内容:
- CLIが表示した対象:
- 結果:
- 証跡:
- 停止位置・復旧先:
- 次の確認条件:
```

### 2026-08-04 09:18 JST：シフト連絡先projection（Development）

- 状態: Development確認済み・Production未確認
- 確認者: Codex（読み取り専用）
- 環境: Development
- 完全修飾deployment名: `dev:fortunate-mallard-809`
- commit SHA: `0a850a78998026cfc6cd65f7de2bb8b9b52451a8`をbaseとする未コミットworktree。Production artifactとの一致は未確認
- artifact: 未登録
- 実行または確認内容: `narrowReadiness/queries:verifyStaffs`を100件単位で5ページ、合計471件走査
- CLIが表示した対象: `fortunate-mallard-809`
- 結果: 最終ページで`isDone: true`。`activeStaffPersonEmailMismatch`の全ページ合計は0件
- 併記する既存anomaly: `missingOrganizationId`と`missingOrganizationPersonId`は各355件。その他の`verifyStaffs` anomalyは0件
- 証跡: 本節に集計した5回のConvex CLI出力。PIIとrow IDは出力されていない
- 停止位置・復旧先: Production公開判定、全体Narrow、schema変更には使用しない
- 次の確認条件: release対象と同じSHA・artifactの完全修飾deploymentで全ページ走査し、Production証跡を別途記録する

## Migrationの記録

exportの検証とmigrationの完了確認は別の証跡として残します。
snapshotの件数やhashが一致しても、migration workerの完走は証明できません。

Migrationを確認するときは、少なくとも次を分けて記録します。

1. 実行前snapshotの取得元、取得時刻、deployment、SHA-256。
2. dry runまたは事前検証の結果と停止条件。
3. migrationを実行した完全修飾deployment名と、CLIが表示した対象。
4. migration statusの完了結果。
5. 実行後snapshotと対象件数、整合性検証。
6. 失敗時のforward recoveryまたは復旧判断。

具体的な実行手順は[組織課金の運用](organization-billing.md)と、対象機能の運用文書を参照してください。

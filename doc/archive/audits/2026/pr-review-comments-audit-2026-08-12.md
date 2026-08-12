# 2026年6月12日〜8月12日 PRレビューコメント現況監査

> Archive日: 2026-08-12
>
> 理由: `point-in-time-audit`
>
> 後継: [テスト方針](../../../rules/testing-strategy.md)、[セキュリティ方針](../../../rules/security-strategy.md)、[リリース状態](../../../manual/release-status.md)
>
> 実施日: 2026-08-12
>
> 対象: `yn1323/yps-crispy-carnival`
>
> 判定基準: GitHub default branch `develop@7266d966ecc52350331bd6206df841fdb8add2a4`
>
> GitHub取得時刻: 2026-08-12 13:38:29 JST

この文書は、指定期間に投稿されたPRレビューコメントを、2026年8月12日時点の現行実装へ照合した時点監査である。
現在仕様の正本ではないため、後日の状態確認ではコード、機能文書、運用証跡を改めて確認する。

## 1. 結論

期間内のPRレビューに由来する102スレッドを全件確認し、同じ原因と修正境界を持つ8件を統合した結果、94件の指摘クラスターとなった。
現在も対応または確認が必要なのは36件で、P1が1件、P2が29件、P3が6件である。
P0は確認されなかった。

P1は、将来シフト割当を件数確認なしで不可逆に削除するR-093の1件である。
一方、R-016とR-080はGitHub ActionsのProduction実行履歴まで追跡した結果、migrationを含むreleaseとNarrow releaseが分離され、両方のConvex deployが成功していたため、未完了P1から実装済みへ改めた。

調査時点のOpen PRは依存更新3件だけで、94クラスターのいずれかをdefault branch外で修正しているPRはなかった。
したがって、`未マージで対応中`は0件である。

### 1.1 集計

| 集計軸 | 内訳 | 合計 |
|---|---|---:|
| 現在の実装状況 | 未実装32、一部実装4、実装済み32、別の方法で解消19、対応不要・見送り7 | 94 |
| 現在優先度 | P0 0、P1 1、P2 29、P3 6、対象外58 | 94 |
| 指摘種別 | actionable 90、情報1、誤検知3 | 94 |
| 判定確度 | 高92、中2、低0 | 94 |

repo実装上の`実装済み`、`別の方法で解消`、`対応不要・見送り`を合わせた58件は、現在優先度を`対象外`とした。
未実装または一部実装の36件は、P1、P2、P3のいずれかである。

優先度は次の閾値で判定した。

| 優先度 | 判定軸 |
|---|---|
| P0 | 現在到達可能な認証・認可回避、広範なデータ喪失、課金事故など、即時停止または緊急対応が必要 |
| P1 | 現在の主要操作を阻害する、または不可逆なデータ・課金・セキュリティ影響が現実的に生じる |
| P2 | 条件付きの不具合、重要な回復・検証契約の欠落、近い将来に現実化し得る保守・運用リスク |
| P3 | 局所的な文言・表示・開発者向け利便性など、回避可能で業務継続への影響が小さい |
| 対象外 | repo実装上すでに解消、別の方法で解消、現行方針では対応不要、情報、誤検知 |

## 2. 最優先で確認すべき項目

### 2.1 現在のP1

| ID | PR・コメント | 現在状況 | 影響と根拠 |
|---|---|---|---|
| R-093 | [#787](https://github.com/yn1323/yps-crispy-carnival/pull/787#discussion_r3763000171) | 未実装 / P1 / 高 | 店舗所属から外す通常ケースでは、今日以降に削除される1〜500件のシフト割当数を見せず自動送信する。現行機能文書の事前表示契約とも不一致。`src/components/features/ShopDetail/ShopStaffMembershipDialog.tsx:257-274,411-429`、`doc/features/shop-settings.md:54-58` |

### 2.2 GitHub Actions証跡で判定を改めた項目

| ID | PR・コメント | 現在判定 | Actionsによる根拠 |
|---|---|---|---|
| R-016 | [#589](https://github.com/yn1323/yps-crispy-carnival/pull/589#discussion_r3468857055) | 実装済み / 対象外 / 高 | [m007/m008を含むProduction release](https://github.com/yn1323/yps-crispy-carnival/actions/runs/28116363270)の後、別の[Narrow release](https://github.com/yn1323/yps-crispy-carnival/actions/runs/28183534286)で`Deploy Convex`とmigration stepが成功した。Git履歴でも前者はNarrow mergeを含まず、後者は含む。 |
| R-078 | [#754](https://github.com/yn1323/yps-crispy-carnival/pull/754#discussion_r3695589584) | 一部実装 / P2 / 高 | m022は包括runnerに残る一方、最新の[Production run](https://github.com/yn1323/yps-crispy-carnival/actions/runs/31295649924)と[Develop run](https://github.com/yn1323/yps-crispy-carnival/actions/runs/31560264851)はともに`Migrations up next already done.`を返す。現在の重大事故より、fresh・復元deploymentでpreflightなしに実行され得る条件付きリスクと判定した。 |
| R-080 | [#760](https://github.com/yn1323/yps-crispy-carnival/pull/760#discussion_r3698458270) | 実装済み / 対象外 / 高 | m021を含む[Production release](https://github.com/yn1323/yps-crispy-carnival/actions/runs/30700098575)の翌日、Narrowを含む[別release](https://github.com/yn1323/yps-crispy-carnival/actions/runs/30740593450)で`Deploy Convex`とmigration stepが成功した。 |

Actionsのstep成功だけではcomponent workerの全batch完走を一般には証明しない。
ただしR-016とR-080は、Widen状態でmigrationを先行させたreleaseとNarrow releaseの分離、およびNarrow schemaのProduction deploy成功を直接確認できるため、元指摘の「migration前にNarrowしてdeployを阻害する」現在条件は解消済みと判断した。
`doc/manual/release-status.md:15-20`はこの実績を登録しておらず、運用正本とActions実績に差がある。

## 3. 母集団と網羅性

| 対象 | 件数 | 扱い |
|---|---:|---|
| 期間開始以後に更新されたPR候補 | 228 PR | 全ページ取得 |
| 期間内materialを持つPR | 223 PR | Conversation、Review、inlineのいずれかを持つPR |
| PR Conversation | 871コメント | 経緯確認に使用。独立指摘には数えない |
| Review本文 | 74件 | 全件`COMMENTED`。レビュー実行案内または空本文で、独立指摘には数えない |
| inline review comment | 104コメント | 99件Codex、3件CodeQL、2件owner返信 |
| inline review thread | 102スレッド / 71 PR | 1スレッド1問題として全件判定 |
| 指摘クラスター | 94件 | 重複8件を代表スレッドへ統合 |

対象71 PRの状態は、Mergedが69件、Closed・未マージが2件である。
GitHub上のスレッド状態はResolved 11件、Unresolved 91件、Outdated 21件、Current 81件だった。
これらは除外条件や完了判定には使っていない。

独立した指摘のroot authorはCodex 99件とCodeQL 3件で、期間内に人がrootとして投稿したinline指摘はなかった。
ownerのinline 2件は[#759の対応説明](https://github.com/yn1323/yps-crispy-carnival/pull/759#discussion_r3698224582)と[#771の見送り判断](https://github.com/yn1323/yps-crispy-carnival/pull/771#discussion_r3725635194)で、元スレッドへ統合した。

Conversation 871件とReview本文74件の合計945件は、CI結果、VRT・Playwright report、Cloudflare deploy通知、Codex review実行案内、CodeQL導入案内などである。
実装上の独立指摘は見つからなかったが、見送りや返信の有無を確認する補助資料として走査した。

## 4. 調査方法

1. GitHub GraphQL APIでPR、Conversation、Review、review thread、thread内返信をページネーションして取得した。
2. RESTのrepo-wide review comment件数とIssue commentを独立照合し、PR Conversationと通常Issue commentを分離した。
3. コメント投稿日を`2026-06-12 00:00:00 JST`以上、`2026-08-13 00:00:00 JST`未満で判定した。
4. thread単位にResolved、Outdated、path、line、返信を復元した。
5. 同じ原因と修正境界を持つthreadをクラスター化した。
6. GitHub default branchを確認し、`develop@7266d966ecc52350331bd6206df841fdb8add2a4`のコード、テスト、機能文書、規約、後続commitへ照合した。
7. 認証、削除、通知、個人情報、billing、migrationはsecurity lensでactor、asset、trust boundary、server-side enforcement、データ寿命を確認した。
8. テスト指摘は現行のテスト層と検証契約に照合し、単なるテスト削除と方針変更を区別した。
9. 暫定P1の6件を再度コード、運用正本、Git履歴、GitHub Actionsのread-only実行履歴へ照合した。
10. 最後にOpen PRを確認し、未マージ対応の有無を分離した。

判定は元コメントのbadgeではなく、現在の影響度、到達可能性、発生頻度、回避策、公開状態を基準にした。
Resolved、Outdated、PR merge、返信上の「対応しました」だけでは実装済みと判定していない。

## 5. 外部証跡と残る確認範囲

GitHub Actionsのread-only実行履歴は確認したが、Production database、Convex component status、外部providerの実値へは接続していない。
Actionsで確認できた範囲と、なお不足する証拠を分離する。

| 対象 | 確認できたこと | 残る未確認範囲 |
|---|---|---|
| R-016 m007/m008 | migrationを含むreleaseとNarrow releaseが分離され、双方のProduction jobと`Deploy Convex`が成功 | component status、実行前後snapshotは未取得。ただし元指摘のdeploy順序とNarrow失敗条件は解消済み |
| R-018 Resend `email.delivered` | repo上のhandlerは実装済み | Production Webhook設定と実到着canary |
| R-054 contact env | setup allowlistは未実装 | 対象deploymentに手動設定済みかどうか |
| R-078 m022 | Production releaseで包括runnerが起動し、最新runではseries完了扱い | 事前snapshot、承認、対象件数、conflict 0と実行結果の整合 |
| R-080 m021 / Narrow | m021を含むreleaseを先行し、翌日のNarrow releaseでもProduction `Deploy Convex`が成功 | component statusとsnapshotは未取得。ただし元指摘のdeploy順序とNarrow失敗条件は解消済み |

この表の「未確認」は未実施を意味しない。
Actionsの成功、repo実装、Productionのデータ・provider状態は、それぞれ別の証拠レイヤーとして扱った。

## 6. 重複スレッドの統合

| # | 代表thread | 統合thread | 同一とした理由 | 現在判定 |
|---:|---|---|---|---|
| 1 | [#566](https://github.com/yn1323/yps-crispy-carnival/pull/566#discussion_r3447068038) | [#567](https://github.com/yn1323/yps-crispy-carnival/pull/567#discussion_r3447110531) | active募集を打ち切った後に`isDone:true`とする同じpagination契約 | 未実装 / P2 / 高 |
| 2 | [#602](https://github.com/yn1323/yps-crispy-carnival/pull/602#discussion_r3483307565) | [#603](https://github.com/yn1323/yps-crispy-carnival/pull/603#discussion_r3483356382) | delayed後にdeliveredとなった同じprovider failureのstate遷移 | 実装済み / 対象外 / 高 |
| 3 | [#610](https://github.com/yn1323/yps-crispy-carnival/pull/610#discussion_r3499439449) | [#614](https://github.com/yn1323/yps-crispy-carnival/pull/614#discussion_r3507453441) | 対象外staffの提出を分子から除かずclampする同じ提出率計算 | 一部実装 / P2 / 高 |
| 4 | [#648](https://github.com/yn1323/yps-crispy-carnival/pull/648#discussion_r3525120556) | [#649](https://github.com/yn1323/yps-crispy-carnival/pull/649#discussion_r3525189817) | 0%をtruthinessで欠損扱いする同じKPI関数 | 別の方法で解消 / 対象外 / 高 |
| 5 | [#753](https://github.com/yn1323/yps-crispy-carnival/pull/753#discussion_r3695549837) | [#754](https://github.com/yn1323/yps-crispy-carnival/pull/754#discussion_r3695589585) | 店舗名へ接尾辞を付けて組織名上限を超える同じ生成処理 | 未実装 / P2 / 高 |
| 6 | [#754-1](https://github.com/yn1323/yps-crispy-carnival/pull/754#discussion_r3695582238) | [#754-2](https://github.com/yn1323/yps-crispy-carnival/pull/754#discussion_r3695582239) | 別testにある同じResend URL mockへのCodeQL指摘 | 誤検知 / 対象外 / 高 |
| 7 | [#763](https://github.com/yn1323/yps-crispy-carnival/pull/763#discussion_r3700719374) | [#783](https://github.com/yn1323/yps-crispy-carnival/pull/783#discussion_r3742692207) | logout後の保護route再訪という同じbrowser契約 | 実装済み / 対象外 / 高 |
| 8 | [#763](https://github.com/yn1323/yps-crispy-carnival/pull/763#discussion_r3700719377) | [#783](https://github.com/yn1323/yps-crispy-carnival/pull/783#discussion_r3742692209) | axe専用suiteを削除する同じテスト方針 | 対応不要・見送り / 対象外 / 高 |

## 7. 詳細台帳

GitHub状態は`PR状態 / thread解決状態 / diff上の状態`の順である。
各リンクは元threadを開くため、期間内返信も同じthreadで確認できる。
特定できた直接の後続commitは根拠欄へ併記し、それ以外は基準HEADの現行ファイルを根拠とした。
指摘種別は、R-004、R-076、R-077が誤検知、R-085が情報、残る90件がactionableである。
重複の対応関係は前節で追跡できる。

| ID | PR・コメント | 投稿日・レビュアー | GitHub状態 | 指摘の要旨 | 現在の実装状況 | 現在優先度 | 確度 | 根拠 | 判定理由 |
|---|---|---|---|---|---|---|---|---|---|
| R-001 | [#520](https://github.com/yn1323/yps-crispy-carnival/pull/520#discussion_r3398059852) | 2026-06-12 03:01 JST / chatgpt-codex-connector | Merged / Resolved / Current | dry-run / 配送抑止ジョブを通知利用量へ加算しない | 実装済み | 対象外 | 高 | `convex/notificationOutbox/mutations.ts:827-855`; `convex/notificationOutbox/mutations.test.ts:1322-1337`; follow-up `e51a9b84` | `markSent` は送信済み化後、実配送抑止なら usage 加算前に return し、専用テストもある。 |
| R-002 | [#521](https://github.com/yn1323/yps-crispy-carnival/pull/521#discussion_r3398089394) | 2026-06-12 03:06 JST / chatgpt-codex-connector | Merged / Resolved / Current | VRT無制限・状態別Story方針を正本にも反映する | 実装済み | 対象外 | 高 | `.agents/skills/test-strategy/references/test-writing-rules.md:101-110`; follow-up `b5cc9767` | 現行の正本は「状態ごとに個別Story」「小部品のみVariants」と明記しており、旧CLAUDEだけの更新ではない。 |
| R-003 | [#526](https://github.com/yn1323/yps-crispy-carnival/pull/526#discussion_r3402333244) | 2026-06-12 18:49 JST / chatgpt-codex-connector | Merged / Resolved / Outdated | 確定待機中の編集・離脱から確定後saveが走る競合を防ぐ | 別の方法で解消 | 対象外 | 中 | `src/components/features/ShiftBoard/ShiftBoardPage/useShiftBoardPageController.ts:292-328`; `src/components/features/ShiftBoard/ShiftBoardPage/ShiftBoardPageView.tsx:134-143`; `src/components/ui/Dialog/index.tsx:209-240` | 確定処理は保存snapshotをbaselineへ反映してからconfirmし、待機中はmodalをbusy化して閉じる操作・browser back・再submitを拒否する。編集面そのものをdisabledにする原案とは異なるため確度は中。 |
| R-004 | [#535](https://github.com/yn1323/yps-crispy-carnival/pull/535#discussion_r3415179946) | 2026-06-16 01:59 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 異なる勤務区分間でも時間重複をエラーにするべきとの指摘 | 対応不要・見送り | 対象外 | 高 | `convex/shiftBoard/validation.ts:131-143`; `convex/shiftBoard/validation.test.ts:172-200`; `doc/features/shift-submission.md:43-48` | 現行仕様は同日の複数勤務区分を許可し、異区分重複許可・同一区分重複拒否を明示テストしている。 |
| R-005 | [#538](https://github.com/yn1323/yps-crispy-carnival/pull/538#discussion_r3421073933) | 2026-06-16 22:25 JST / chatgpt-codex-connector | Merged / Resolved / Outdated | desktop VRT viewportを明示する | 実装済み | 対象外 | 高 | `vitest.vrt.config.ts:22-26,71-80`; `.storybook/vitest.vrt.setup.ts:73-75` | desktopは1280x720でproject/browserへ渡され、各test前にも同viewportが適用される。 |
| R-006 | [#547](https://github.com/yn1323/yps-crispy-carnival/pull/547#discussion_r3424721936) | 2026-06-17 08:54 JST / chatgpt-codex-connector | Merged / Unresolved / Current | fullPage画像全体に対する0.1%許容で小さな欠落を見逃さない | 未実装 | P2 | 高 | `regconfig.json:1-10`; `.storybook/vitest.vrt.setup.ts:79-90` | 現在も `thresholdRate: 0.001` と `fullPage: true` の組合せで、ページ高に比例して許容差分pixelが増える。pixel上限等への変更はない。 |
| R-007 | [#550](https://github.com/yn1323/yps-crispy-carnival/pull/550#discussion_r3425821246) | 2026-06-17 14:40 JST / chatgpt-codex-connector | Merged / Unresolved / Current | eligibleなopen募集がない再送を成功表示しない | 実装済み | 対象外 | 高 | `convex/staff/mutations.ts:1545-1584`; `convex/staff/mutations.test.ts:1548-1585`; `src/components/features/Dashboard/StaffManagement/useStaffNotificationDelivery.ts:12-24` | mutationが募集0件を `scheduled:false/noEligibleRecruitments` で返し、UIも成功toastではなく案内を出す。 |
| R-008 | [#551](https://github.com/yn1323/yps-crispy-carnival/pull/551#discussion_r3426077765) | 2026-06-17 15:37 JST / chatgpt-codex-connector | Merged / Unresolved / Current | LINE quota超過時のemailなしスタッフ再送を成功受付しない | 未実装 | P2 | 高 | `convex/staff/mutations.ts:1545-1584`; `convex/notification/actions.ts:1006-1032`; `src/components/features/Dashboard/StaffManagement/useStaffNotificationDelivery.ts:12-24` | mutationはLINE連携だけで `scheduled:true` を返す一方、actionはquotaでemailへfallbackしemailなしなら何もenqueueせずcontinueするため、UI成功表示との偽成功が残る。 |
| R-009 | [#558](https://github.com/yn1323/yps-crispy-carnival/pull/558#discussion_r3438049147) | 2026-06-19 03:23 JST / chatgpt-codex-connector | Merged / Unresolved / Current | SP日別で希望時間あり・割当なし行を休み扱いせず希望を見せる | 未実装 | P2 | 高 | `src/components/features/Shift/ShiftForm/sp/DailyView/index.tsx:53-65,140-175`; `src/components/features/Shift/ShiftForm/sp/DailyView/StaffCards.tsx:185-190` | 希望ありを認識しながら、対象行を希望barを描かない`SPOffCard`へ送る。編集時はSheetで希望時間を確認でき割当・保存は阻害されないが、read-onlyではカード操作も無効で表示へ到達できない条件付き誤表示としてP2。 |
| R-010 | [#561](https://github.com/yn1323/yps-crispy-carnival/pull/561#discussion_r3439884328) | 2026-06-19 11:01 JST / chatgpt-codex-connector | Merged / Unresolved / Current | backend先行deploy時に旧clientへ重複登録の偽成功を返さない | 別の方法で解消 | 対象外 | 高 | `convex/staffRegistration/mutations.ts:103-127,230-260`; `convex/staffRegistration/mutations.test.ts:253-310`; `convex/staffRegistration/httpActions.test.ts:246-306` | 匿名登録は列挙防止の汎用accepted契約を持つHTTP境界へ移り、旧public mutationはinternal化された。旧bundleは同名public APIで偽成功を受けず、現在のsecurity contractへversioned相当で移行済み。 |
| R-011 | [#566](https://github.com/yn1323/yps-crispy-carnival/pull/566#discussion_r3447068038) | 2026-06-21 02:06 JST / chatgpt-codex-connector | Merged / Unresolved / Current | active募集取得でpaginationを守るか、意図的bounded queryにする | 未実装 | P2 | 高 | `convex/dashboard/queries.ts:431-483,807-827` | groupごとにtake/sliceした候補をすべて返し、要求件数へpaginateせず常に `isDone:true`。複数groupの合計がnumItemsを超え、残りへ到達不能な契約が残る。 |
| R-012 | [#567](https://github.com/yn1323/yps-crispy-carnival/pull/567#discussion_r3447110530) | 2026-06-21 02:23 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 未展開の過去シフトボタンをloading/disabledにしない | 実装済み | 対象外 | 高 | `src/components/features/Dashboard/RecruitmentBoard/index.tsx:39-45,141-151`; follow-up `f183de9e` | past query未展開時はloading判定をせず、初回ボタンを押下できる。 |
| R-013 | [#573](https://github.com/yn1323/yps-crispy-carnival/pull/573#discussion_r3453455406) | 2026-06-23 00:26 JST / chatgpt-codex-connector | Merged / Resolved / Outdated | 「すべて再通知」で `hasMore` の後続batchも処理する | 実装済み | 対象外 | 高 | `src/components/features/Dashboard/NotificationFailureRecovery/script.ts:15-35`; `src/components/features/Dashboard/NotificationFailureRecovery/script.test.ts:7-53` | 最大20batchを継続し、無進捗・上限到達時は残件ありとしてwarningへ分岐する。なおhidden行で無進捗になる別問題は[#640](https://github.com/yn1323/yps-crispy-carnival/pull/640#discussion_r3523579746)に残る。 |
| R-014 | [#573](https://github.com/yn1323/yps-crispy-carnival/pull/573#discussion_r3453455413) | 2026-06-23 00:26 JST / chatgpt-codex-connector | Merged / Resolved / Outdated | シフト日付をbrowser local timeでなくJSTで比較する | 実装済み | 対象外 | 高 | `src/domains/shift/date.ts:21-26,55-61`; `src/domains/shift/date.test.ts:41-55` | `Asia/Tokyo`固定のtodayを使い、UTC上で日付が異なる境界の回帰testがある。 |
| R-015 | [#579](https://github.com/yn1323/yps-crispy-carnival/pull/579#discussion_r3461062625) | 2026-06-24 00:49 JST / chatgpt-codex-connector | Merged / Resolved / Current | 公開済み旧記事URLをredirect / aliasで維持する | 実装済み | 対象外 | 高 | `src/components/features/ArticleSite/articleAliases.ts:1-7`; `scripts/staticSite.test.ts:63-67,98-101` | 旧slugを現記事へ解決し、旧route自体もSSG対象に含めてcanonicalを現slugへ向ける。 |
| R-016 | [#589](https://github.com/yn1323/yps-crispy-carnival/pull/589#discussion_r3468857055) | 2026-06-25 02:00 JST / chatgpt-codex-connector | Merged / Unresolved / Current | m007/m008完走前にschemaをnarrowしない | 実装済み | 対象外 | 高 | [m007/m008先行Production run](https://github.com/yn1323/yps-crispy-carnival/actions/runs/28116363270); [Narrow Production run](https://github.com/yn1323/yps-crispy-carnival/actions/runs/28183534286); `.github/workflows/release.yml:60-67` | Git履歴上、先行releaseはmigrationを含むがNarrow mergeを含まず、その後の別releaseがNarrowを含む。両jobの`Deploy Convex`とmigration stepが成功しており、指摘どおり段階releaseされている。 |
| R-017 | [#597](https://github.com/yn1323/yps-crispy-carnival/pull/597#discussion_r3475479020) | 2026-06-26 00:11 JST / chatgpt-codex-connector | Merged / Resolved / Outdated | enqueue失敗eventは残し、Failure Inboxだけcontextで抑止する | 実装済み | 対象外 | 高 | `convex/notificationOutbox/enqueue.ts:97-125`; `convex/notificationOutbox/failureSuppress.ts:1-24` | suppress payloadでも `enqueue_failed` を記録し、emailとLINE fallback双方のcontextを共通抑止集合で判定する。 |
| R-018 | [#602](https://github.com/yn1323/yps-crispy-carnival/pull/602#discussion_r3483307565) | 2026-06-27 03:15 JST / chatgpt-codex-connector | Merged / Unresolved / Current | delayed後にdeliveredとなったemailのFailure Inboxを解決する | 実装済み | 対象外 | 高 | `convex/notificationOutbox/resendProviderEvents.ts:1-18`; `convex/notificationOutbox/mutations.ts:491-528` | `email.delivered` を受理し、履歴更新後にprovider failureを解決する。ただしProductionのdelivered Webhook設定は `doc/manual/release-status.md:15-22` で未確認。 |
| R-019 | [#606](https://github.com/yn1323/yps-crispy-carnival/pull/606#discussion_r3484790486) | 2026-06-27 09:53 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | actionability filterをpagination前に適用する | 実装済み | 対象外 | 高 | `convex/notificationOutbox/queries.ts:100-156`; `convex/notificationOutbox/queries.test.ts:312-395` | `paginator(...).filterWith(...)` で不可視行を越えてpageを満たし、不可視行が先頭を埋める回帰testもある。 |
| R-020 | [#607](https://github.com/yn1323/yps-crispy-carnival/pull/607#discussion_r3484796045) | 2026-06-27 09:56 JST / chatgpt-codex-connector | Merged / Resolved / Outdated | 破壊的な店舗削除に明示target / 確認IDを必須化する | 実装済み | 対象外 | 高 | `convex/shop/mutations.ts:119-139`; `convex/shop/mutations.test.ts:778-826` | `confirmShopId` が必須で、resolverが選んだ店舗と一致しないと拒否する。事業者店舗はさらにcanonical削除APIへ寄せる。 |
| R-021 | [#607](https://github.com/yn1323/yps-crispy-carnival/pull/607#discussion_r3484796051) | 2026-06-27 09:56 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | 削除店舗のpending / processing通知を停止する | 実装済み | 対象外 | 高 | `convex/deletionCleanup/mutations.ts:533-565`; `convex/shop/mutations.test.ts:983-1060` | cleanupがpendingを取消し、processingはlease終了を待ってcancelする。Failure Inbox解決とsent保持もtest済み。 |
| R-022 | [#607](https://github.com/yn1323/yps-crispy-carnival/pull/607#discussion_r3484796055) | 2026-06-27 09:56 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | 店舗削除のunbounded collectを永続bounded cleanupへ移す | 実装済み | 対象外 | 高 | `convex/shop/mutations.ts:119-146`; `convex/deletionCleanup/mutations.ts:480-532` | 削除mutationは論理削除とcleanup job起動だけを行い、各resourceをcursor / bounded takeで反復する。 |
| R-023 | [#608](https://github.com/yn1323/yps-crispy-carnival/pull/608#discussion_r3487279762) | 2026-06-28 12:16 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | LINE連携案内の一括再送をfailure IDでなくstaff単位にdedupe / rate-limitする | 実装済み | 対象外 | 高 | `convex/notificationOutbox/mutations.ts:1791-1820,2548-2556`; `convex/notificationOutbox/mutations.test.ts:2796-2833` | staff単位batch keyと既存 `lineInviteShort` rate limitを使い、同一staffの複数失敗を1予約へ畳む。 |
| R-024 | [#608](https://github.com/yn1323/yps-crispy-carnival/pull/608#discussion_r3487279764) | 2026-06-28 12:16 JST / chatgpt-codex-connector | Merged / Unresolved / Current | emailなしLINE案内失敗のDTOを `canRetry:false` にする | 未実装 | P2 | 高 | `convex/notificationOutbox/queries.ts:121-149,177-180`; `convex/notificationOutbox/mutations.ts:1799-1803` | 一覧はstaffを既に読むのに `canRetry` はstaffIdの有無だけでtrue。一方mutationはemailなしをnotRetryableにするため、押せるが必ず失敗するボタンが残る。 |
| R-025 | [#609](https://github.com/yn1323/yps-crispy-carnival/pull/609#discussion_r3487663089) | 2026-06-28 18:33 JST / chatgpt-codex-connector | Merged / Unresolved / Current | desktop dateOnlyも今日を含む週から開く | 実装済み | 対象外 | 高 | `src/components/features/Shift/ShiftForm/pc/DateOnlyView/index.tsx:38-52`; `src/domains/shift/date.ts:64-72` | 共通selectedDate（defaultToTodayで今日）を読み、その日を含むweekへ初回だけ移動する。 |
| R-026 | [#610](https://github.com/yn1323/yps-crispy-carnival/pull/610#discussion_r3499439449) | 2026-06-30 23:18 JST / chatgpt-codex-connector | Merged / Unresolved / Current | シフト対象外staffを提出率の分子からも除外する | 一部実装 | P2 | 高 | `convex/dashboard/queries.ts:359-365,373-399`; [詳細化 #614](https://github.com/yn1323/yps-crispy-carnival/pull/614#discussion_r3507453441) | 母数から除外しraw分子を母数でclampするため `2/1` は防ぐが、対象外の過去提出自体は除かず `2/2` の偽完了が残る。 |
| R-027 | [#610](https://github.com/yn1323/yps-crispy-carnival/pull/610#discussion_r3499439457) | 2026-06-30 23:18 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 対象外化時に発行済みshift session / magic linkを失効する | 実装済み | 対象外 | 高 | `convex/staff/mutations.ts:1664-1705`; `convex/_lib/functions.ts:289-313` | 対象外化mutationで既存tokenを失効し、session認証境界でも `isShiftTargetStaff` を再検証する多層防御になっている。 |
| R-028 | [#614](https://github.com/yn1323/yps-crispy-carnival/pull/614#discussion_r3507453449) | 2026-07-02 01:10 JST / chatgpt-codex-connector | Merged / Unresolved / Current | deleteとclaimed outboxの競合で外部送信・sent上書きを防ぐ | 実装済み | 対象外 | 高 | `convex/notificationOutbox/actions.ts:56-73`; `convex/notificationOutbox/mutations.ts:611-626,827-855` | provider直前に現leaseと店舗eligibilityを再検証し、取消後の旧leaseでは `markSent` がfalseとなる。指摘のclaimed-before-delete経路を閉じている。 |
| R-029 | [#616](https://github.com/yn1323/yps-crispy-carnival/pull/616#discussion_r3509606629) | 2026-07-02 08:35 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | SEO H1を未使用componentでなく `/` の実routeへ反映する | 別の方法で解消 | 対象外 | 高 | `src/routes/index.tsx:1-8`; `src/components/features/LandingPage/HeroSection/index.tsx:53-82` | NewLandingPageは撤去され、`/` が使うLandingPageに無料シフト管理のbadge・H1・説明文が直接ある。 |
| R-030 | [#619](https://github.com/yn1323/yps-crispy-carnival/pull/619#discussion_r3510518539) | 2026-07-02 13:44 JST / chatgpt-codex-connector | Merged / Unresolved / Current | Shiftoriを制限付き「店舗向け無料プラン」型へ対応付けない | 未実装 | P2 | 高 | `src/components/features/ArticleSite/content/articles/free-shift-tool-selection/index.mdx:37-41,93-101` | 現文は支払い不要Businessを説明する一方、依然「3つめのタイプ＝店舗向けツールの無料プラン」と明記し、前段の人数・機能制限型へ読者を対応付ける。 |
| R-031 | [#620](https://github.com/yn1323/yps-crispy-carnival/pull/620#discussion_r3511172578) | 2026-07-02 16:17 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 記事updatedAtとsitemap lastmodを同期する | 未実装 | P3 | 高 | `src/components/features/ArticleSite/content/articles/free-shift-tool-selection/index.mdx:1-10`; `public/sitemap.xml:135-139` | 指摘時の記事群は後日更新されたが、現在も記事updatedAt 2026-08-08に対しsitemapは2026-08-02。検索向けfreshness hintの不一致で手動更新も可能なため、現在影響は局所的。 |
| R-032 | [#621](https://github.com/yn1323/yps-crispy-carnival/pull/621#discussion_r3511398855) | 2026-07-02 16:59 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | 320pxでhero badgeをnowrap overflowさせない | 実装済み | 対象外 | 高 | `src/components/features/LandingPage/HeroSection/index.tsx:40-54`; `src/components/features/LandingPage/HeroSection/index.stories.tsx:15-21` | routed heroは旧 `whiteSpace=nowrap` を持たず通常wrap可能。ただしVRT storyは現在もmobile2のみで、mobile1回帰検知は別途弱い。 |
| R-033 | [#622](https://github.com/yn1323/yps-crispy-carnival/pull/622#discussion_r3513018077) | 2026-07-02 21:33 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 法務Markdownのtable / image / hrを黙って欠落させない | 別の方法で解消 | 対象外 | 高 | `src/components/shared/LegalDocumentPage/index.tsx:46-73`; `src/components/shared/LegalDocumentPage/legalContent.ts:21-51` | 独自block parserは廃止されMDX componentを直接描画するため、未override要素はnative MDX要素として残り、旧rendererの `null` fallthroughがない。 |
| R-034 | [#623](https://github.com/yn1323/yps-crispy-carnival/pull/623#discussion_r3514100483) | 2026-07-03 00:05 JST / chatgpt-codex-connector | Merged / Unresolved / Current | public LPへ料金・plan情報sectionを戻す | 未実装 | P2 | 高 | `src/components/features/LandingPage/index.tsx:1-22`; `src/components/features/LandingPage/HeroSection/index.tsx:78-82` | `/` のsection列にpricingは無く、heroは無料開始だけを案内する。公開LP内でplan条件を比較・確認できない状態が続く。 |
| R-035 | [#633](https://github.com/yn1323/yps-crispy-carnival/pull/633#discussion_r3520233667) | 2026-07-03 22:44 JST / chatgpt-codex-connector | Merged / Unresolved / Current | AI draftは複数希望のmin/maxでなく各interval内包を検証する | 別の方法で解消 | 対象外 | 高 | `doc/plans/2026-07-03_AIシフト下書き機能_実装仕様書.md:729-758,953-965`; `doc/plans/INDEX.md:17-24` | 後続の実装仕様が「希望帯のいずれかに完全に収まる」と専用testを明記した。機能自体はProposedでruntime未導入のため現行不具合はない。 |
| R-036 | [#633](https://github.com/yn1323/yps-crispy-carnival/pull/633#discussion_r3520233672) | 2026-07-03 22:44 JST / chatgpt-codex-connector | Merged / Unresolved / Current | Anthropic prompt DTOからstaff氏名を除く | 未実装 | P2 | 高 | `doc/plans/2026-07-03_AIシフト下書き機能.md:149-159`; `doc/plans/2026-07-03_AIシフト下書き機能_実装仕様書.md:281-294` | 詳細計画も後続仕様もAIへindexとnameを渡す設計のまま。現在はProposedで送信処理未実装だが、採用前に不要なPII外部送信を除くsecurity gateが必要。 |
| R-037 | [#636](https://github.com/yn1323/yps-crispy-carnival/pull/636#discussion_r3522773825) | 2026-07-04 16:26 JST / chatgpt-codex-connector | Merged / Unresolved / Current | Analytics失敗KPIへprovider / enqueue失敗も含める | 未実装 | P2 | 高 | `convex/analytics/aggregation.ts:272-305`; `doc/features/analytics.md:130-137` | 現日次集計は `notificationOutbox.status=failed` と `failedAt` だけを走査し、sentのままprovider failureとなる行やoutbox未作成のenqueue failureを数えない。 |
| R-038 | [#636](https://github.com/yn1323/yps-crispy-carnival/pull/636#discussion_r3522773826) | 2026-07-04 16:26 JST / chatgpt-codex-connector | Merged / Unresolved / Current | Analytics sent KPIからdry-run / suppressDeliveryを除く | 未実装 | P2 | 高 | `convex/analytics/aggregation.ts:279-313`; `convex/notificationOutbox/mutations.ts:827-855` | usage加算は抑止を除外するが、Analyticsは `status=sent` 全行をpayload確認なしで加算するため、実配送なしのsentが残る。 |
| R-039 | [#636](https://github.com/yn1323/yps-crispy-carnival/pull/636#discussion_r3522773828) | 2026-07-04 16:26 JST / chatgpt-codex-connector | Merged / Unresolved / Current | Analytics snapshotのper-shop関連readをpaginate / bounded化する | 別の方法で解消 | 対象外 | 高 | `convex/analytics/reset.ts:250-302,359-427`; `doc/features/analytics.md:140-142` | 現resetはshops/staffs/recruitmentsを各tableのglobal cursorでpage化し、staffごとのLINEはindexed first。日次scopeは上限超過時に不完全値を出さずrunをfailさせる契約へ再設計された。 |
| R-040 | [#640](https://github.com/yn1323/yps-crispy-carnival/pull/640#discussion_r3523579744) | 2026-07-05 02:17 JST / chatgpt-codex-connector | Merged / Unresolved / Current | managerQueryのshop fallbackも削除店舗を飛ばして生存店舗を選ぶ | 実装済み | 対象外 | 高 | `convex/_lib/functions.ts:117-168`; `convex/dashboard/queries.test.ts:235-270` | shared resolverが利用可能なorganization shopを探索し、legacy所属も順にaccess検証するため、先頭の削除店舗だけで停止しない。 |
| R-041 | [#640](https://github.com/yn1323/yps-crispy-carnival/pull/640#discussion_r3523579746) | 2026-07-05 02:17 JST / chatgpt-codex-connector | Merged / Unresolved / Current | bulk resendはhidden最新行を越えてvisible失敗をscanする | 未実装 | P2 | 高 | `convex/notificationOutbox/mutations.ts:1623-1678`; `src/components/features/Dashboard/NotificationFailureRecovery/script.ts:20-31` | backendはopen最新50件を固定takeしてからvisibility filterし、hiddenだけなら0件・hasMore true。frontendは無進捗で停止するため、一覧には見える古い失敗を一括再送できない。 |
| R-042 | [#641 r3523629634](https://github.com/yn1323/yps-crispy-carnival/pull/641#discussion_r3523629634) | 2026-07-05 02:57 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 確定シフト通知の失敗を表示・再送可能にする | 未実装 | P2 | 高 | `convex/notificationOutbox/failureEligibility.ts:14-30`; `convex/notificationOutbox/history.ts:129-138`; `src/components/features/Dashboard/StaffRoster/StaffDetailNotificationTab.tsx:64-74`; `src/components/features/StaffNotificationHistory/StaffNotificationHistoryView.tsx:93-134` | 確定済み募集の不達はFailure Inboxと`hasOpenFailures`から隠れ、Inbox経由では直接再送できない。一方、スタッフ詳細には失敗状態を含む履歴と確定シフト手動再送があるため、発見性を欠く重要な回復契約としてP2。 |
| R-043 | [#641 r3523629637](https://github.com/yn1323/yps-crispy-carnival/pull/641#discussion_r3523629637) | 2026-07-05 02:57 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 200人超店舗の分析staff数を途中で切らない | 別の方法で解消 | 対象外 | 高 | 後続commit `721a3884`（旧`dailyAggregation.ts`を置換）; `convex/analytics/aggregation.ts:356-367,445-479`; `convex/analytics/registry.ts:11-20`; `convex/analytics/pipeline.test.ts:1184-1243` | 新分析基盤は表示用200件上限を再利用せず、分析membershipを上限+1まで読んで超過時はrunをfail closedにする。少なくとも先頭200人だけを正しいsnapshotとして保存する旧不具合は残っていない。 |
| R-044 | [#646 r3524033944](https://github.com/yn1323/yps-crispy-carnival/pull/646#discussion_r3524033944) | 2026-07-05 09:07 JST / chatgpt-codex-connector | Merged / Unresolved / Current | email空のQR登録はLINE友だち状態まで要求する | 別の方法で解消 | 対象外 | 高 | `convex/staffRegistration/schemas.ts:5-11`; `convex/staffRegistration/mutations.ts:55-66,100-139`; `doc/features/staff-registration.md:24-28,51-62`; 計画上の未実装案 `doc/plans/2026-07-04_メールアドレス任意化_設計.md:308,374` | 現行の公開登録はemail必須で、email空+LINE未followを受理する経路自体が実装されていない。計画を将来再開する場合は指摘条件が必要だが、現在仕様では通知手段なしstaffをこの経路から作れない。 |
| R-045 | [#648 r3525120556](https://github.com/yn1323/yps-crispy-carnival/pull/648#discussion_r3525120556) | 2026-07-06 00:11 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 分子0・分母正のKPIを0%として保持する | 別の方法で解消 | 対象外 | 高 | 後続commit `721a3884`; `apps/analytics-dashboard/src/features/analytics/format.ts:39-49`; `convex/analyticsDashboard/queryHelpers.ts:73-78` | 旧truthiness判定は削除済み。現行は欠損または分母0だけをnullにし、`0 / 正数`はrate 0として返す。 |
| R-046 | [#648 r3525120558](https://github.com/yn1323/yps-crispy-carnival/pull/648#discussion_r3525120558) | 2026-07-06 00:11 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 500件取得後にsortする不正確な全体rankingを直す | 別の方法で解消 | 対象外 | 高 | 後続commit `721a3884`; `convex/analyticsDashboard/schemas.ts:66-69`; `convex/analyticsDashboard/queries.ts:894-958`; `doc/features/analytics-dashboard.md:118-121` | 旧KPI top-50 ranking APIは廃止された。現行一覧はindex順にpaginateし、表示中pageを全体rankingとして見せないことを明示している。 |
| R-047 | [#648 r3525120561](https://github.com/yn1323/yps-crispy-carnival/pull/648#discussion_r3525120561) | 2026-07-06 00:11 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | E2E POMのstaff削除ラベルを実UIに合わせる | 実装済み | 対象外 | 高 | PR #648 merge tree `20415784:e2e/pages/DashboardPage.ts:215-222`; 現行 `src/components/features/Dashboard/StaffRoster/StaffDetailSettingsTab.tsx:128-139`; `src/components/features/Dashboard/StaffRoster/StaffDetailDialog.stories.tsx:542-552` | threadは未解決/outdatedだが、merge treeでは既に`スタッフを削除` / `スタッフを削除しますか？`へ修正済み。後続E2E再編で当該POM helperは削除されたが、現行UI契約にも正しい文言のBehavior検証がある。 |
| R-048 | [#649 r3525189816](https://github.com/yn1323/yps-crispy-carnival/pull/649#discussion_r3525189816) | 2026-07-06 01:02 JST / chatgpt-codex-connector | Merged / Unresolved / Current | `dev:all`が呼ぶ`convex:dev` aliasを復元する | 未実装 | P2 | 高 | `package.json:25`; `package.json:63-64` | `dev:all`は現在も`pnpm convex:dev`を起動するが、そのscriptは存在せず`convex` / `convex:configure`しか定義されていない。combined dev commandのConvex processは起動できない。 |
| R-049 | [#651 r3529195647](https://github.com/yn1323/yps-crispy-carnival/pull/651#discussion_r3529195647) | 2026-07-06 22:21 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | 履歴200件で切る前にopen募集を数える | 別の方法で解消 | 対象外 | 高 | 後続commit `721a3884`; `convex/analytics/aggregation.ts:445-457`; `convex/analytics/registry.ts:11-20` | 旧`openRecruitmentCount` / lifecycle stage snapshotは置換された。現行はcycle scopeを上限+1まで検査し、超過なら不完全値を保存せず失敗するため、後方のopen募集だけを黙って落とす経路はない。 |
| R-050 | [#651 r3529195653](https://github.com/yn1323/yps-crispy-carnival/pull/651#discussion_r3529195653) | 2026-07-06 22:21 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 最初の500店舗ではなく完全rollupでstage totalsを出す | 別の方法で解消 | 対象外 | 高 | 後続commit `721a3884`; `convex/analytics/aggregation.ts:940-989,1081-1131` | 旧`getShopStages`は廃止。service totalsはorganization pageごとに全件加算し、segmentもdaily shop KPIを全page処理するため、先頭500件由来のtotalではない。 |
| R-051 | [#657 r3545298801](https://github.com/yn1323/yps-crispy-carnival/pull/657#discussion_r3545298801) | 2026-07-09 00:36 JST / chatgpt-codex-connector | Merged / Unresolved / Current | `getShopStages`の店舗ごと多table fan-outを避ける | 別の方法で解消 | 対象外 | 高 | 後続commit `721a3884`; `convex/analytics/aggregation.ts:727-750`; `convex/analyticsDashboard/queries.ts:1027-1052`; `convex/analyticsDashboard/schemas.ts:19-23` | 店舗KPIは夜間aggregationで永続化され、画面queryは最大100件のdimension pageと各店舗の最新保存済みKPIを読む。旧staff/recruitment/stats/notification全scanのper-shop fan-outはない。 |
| R-052 | [#657 r3545298805](https://github.com/yn1323/yps-crispy-carnival/pull/657#discussion_r3545298805) | 2026-07-09 00:36 JST / chatgpt-codex-connector | Merged / Unresolved / Current | statsなしlegacy募集でも提出人数を表示する | 別の方法で解消 | 対象外 | 高 | 後続commit `721a3884`; `convex/analytics/projection.ts:919-960,1018-1044`; `doc/features/analytics.md:91-94` | 現行cycle集計は`recruitmentStats`に依存せず`shiftSubmissions`を直接統合する。一方、切替前分母を証明できないcycleは欠損を推測せず明示的に`unavailable`とする契約へ置換された。 |
| R-053 | [#668 r3561086151](https://github.com/yn1323/yps-crispy-carnival/pull/668#discussion_r3561086151) | 2026-07-11 03:14 JST / chatgpt-codex-connector | Merged / Unresolved / Current | Slack遅延で受付済み問い合わせを待たせない | 未実装 | P2 | 高 | `convex/contact/actions.ts:55-76,96-114`; `convex/contact/httpActions.test.ts:207-229` | Resend成功後もtimeoutなしでSlack `fetch`をawaitし、完了後に初めて`accepted`を返す。testは即時HTTP 500だけでblackhole/timeoutを覆わない。 |
| R-054 | [#669 r3561244392](https://github.com/yn1323/yps-crispy-carnival/pull/669#discussion_r3561244392) | 2026-07-11 03:44 JST / chatgpt-codex-connector | Merged / Unresolved / Current | contact用Convex envをsetup sync対象に加える | 未実装 | P2 | 高 | `scripts/setupEnv.ts:27-45`; `convex/_lib/config.ts:10-26` | setup allowlistに`TURNSTILE_SECRET_KEY`、`CONTACT_RECIPIENT_EMAIL`、`CONTACT_ALLOWED_ORIGINS`、Slack webhookがない。setup helperだけで構成したdeploymentではcontact endpointを利用可能にできない。実deploymentへの手動設定有無はrepoからは確認できない。 |
| R-055 | [#671 r3563043522](https://github.com/yn1323/yps-crispy-carnival/pull/671#discussion_r3563043522) | 2026-07-11 12:26 JST / chatgpt-codex-connector | Merged / Unresolved / Current | malformed hashで公開HowTo全体を落とさない | 未実装 | P2 | 高 | `src/components/features/HowToSite/index.tsx:27-37` | mount時・hashchange時ともuser-controlled fragmentへ`decodeURIComponent`をunguardedで呼ぶ。`#%`等で例外となる経路が現存し、回帰testも見当たらない。 |
| R-056 | [#680 r3564592341](https://github.com/yn1323/yps-crispy-carnival/pull/680#discussion_r3564592341) | 2026-07-12 01:28 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 6-step workflowをmobileでも読める形にする | 未実装 | P3 | 高 | `src/components/features/HowToSite/content/shift-workflow.mdx:23-28`; `src/components/features/HowToSite/mdxComponents.tsx:81-90`; `public/howto/shift-workflow.webp`（1600×859） | 現在も単一横長画像だけを`w="full"`で縮小する。ただしaltに6段階の概要があり、業務操作を止めない局所的な説明可読性の問題である。 |
| R-057 | [#683 r3565950391](https://github.com/yn1323/yps-crispy-carnival/pull/683#discussion_r3565950391) | 2026-07-12 17:26 JST / chatgpt-codex-connector | Merged / Unresolved / Current | HowToを実UIの`日別`タブ表記に合わせる | 未実装 | P3 | 高 | `src/components/features/HowToSite/content/input-work-time.mdx:20-25`; `src/components/features/Shift/ShiftForm/components.tsx:160-164`; `src/components/features/Shift/ShiftForm/stories/date-only-sp.stories.tsx:60-83` | 記事は今も「日ごと」、画面tabは「日別」で不一致だが、UIから対象を推測できる局所的な文言問題である。 |
| R-058 | [#693 r3588881456](https://github.com/yn1323/yps-crispy-carnival/pull/693#discussion_r3588881456) | 2026-07-16 01:06 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 古いCI runが新しいPR reportを上書きしないようhead SHAを照合する | 一部実装 | P2 | 中 | 後続commit `85e301b9`で旧`pr-report-comments.yml`削除; `.github/workflows/playwright.yml:12-14`; `.github/workflows/vrt.yml:36-69,249-278` | PlaywrightはPR単位concurrencyで旧runをcancelする別解が入った。一方VRTは現行PR event payloadから宛先を作り、concurrencyも現在headの再照合もないまま既存commentを削除するため、遅い旧runが新結果を上書きする同種raceが残る。 |
| R-059 | [#693 r3588881463](https://github.com/yn1323/yps-crispy-carnival/pull/693#discussion_r3588881463) | 2026-07-16 01:06 JST / chatgpt-codex-connector | Merged / Unresolved / Current | PR close時に`pr-N-e2e` Convex previewも削除する | 一部実装 | P2 | 高 | 後続commit `051d64ea`; `.github/workflows/deploy.yml:136-143`; `.github/workflows/playwright.yml:23-25` | cleanup名には`-deploy,-e2e`の両方が追加され、mergeされたPRの指摘は解消。ただしConvex削除step自体が`merged == true`限定となったため、CI実行後にcloseした未merge PRでは`pr-N-e2e`（およびdeploy）が残る。 |
| R-060 | [#715 r3631097580](https://github.com/yn1323/yps-crispy-carnival/pull/715#discussion_r3631097580) | 2026-07-22 23:31 JST / chatgpt-codex-connector | Merged / Resolved / Outdated | retry trace.zipがあっても安全な失敗reportを公開できるようにする | 別の方法で解消 | 対象外 | 高 | 後続commit `2d7dd9ea`で旧trusted public-input flowを削除; `.github/workflows/playwright.yml:75-92`; `scripts/assertNoSensitiveArtifacts.test.ts:222-283` | 現行privacy gateはZIP内部を検査でき、safeな`trace.zip`は通し、secret・capability URL・path traversal・破損ZIPは拒否する。旧`playwright-public-input-*`経路はなくなったが、同じ失敗report公開可否の問題は安全な別の方法で解消した。 |
| R-061 | [#720 r3635835088](https://github.com/yn1323/yps-crispy-carnival/pull/720#discussion_r3635835088) | 2026-07-23 14:49 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 維持するConvex SkillのClaude入口を残す | 実装済み | 対象外 | 高 | 後続commit `721a3884`、`1fd0a9ec`; `.claude/skills/convex/SKILL.md:1-5`; `.claude/skills/convex-quickstart/SKILL.md:1-5`; `.claude/skills/convex-setup-auth/SKILL.md:1-5` | 指摘された3つのClaude側入口は現行treeにすべて存在し、Skill本文を探索できる。 |
| R-062 | [#726 / r3667683770](https://github.com/yn1323/yps-crispy-carnival/pull/726#discussion_r3667683770) | 2026-07-29 02:10 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | 招待通知テストで公開フラグを有効化する | 実装済み | 対象外 | 高 | `convex/notificationOutbox/mutations.test.ts:860-862` | 対象テストは `FEATURE_MANAGER_INVITATION=enabled` を明示してから招待経路を実行しており、レビューで指摘された誤った早期returnを防いでいる。 |
| R-063 | [#727 / r3669997106](https://github.com/yn1323/yps-crispy-carnival/pull/727#discussion_r3669997106) | 2026-07-29 08:57 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 店舗所属追加をサーバー側のフラグでも閉じる | 対応不要・見送り | 対象外 | 高 | `doc/features/organization-billing.md:17-19`<br>`convex/staff/mutations.ts:554-598` | repo上の現行仕様では`FEATURE_SHOP_ADDITION`自体を廃止し、常時利用可能な契約へ変更した。mutationは管理者・組織・人物境界を再検証するため、当時の非公開化要求は現行仕様の対象外。Production露出は別途未検証。 |
| R-064 | [#727 / r3669997111](https://github.com/yn1323/yps-crispy-carnival/pull/727#discussion_r3669997111) | 2026-07-29 08:57 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 非公開の他店舗追加をFAQから外す | 対応不要・見送り | 対象外 | 高 | `doc/features/organization-billing.md:17-19`<br>`src/components/features/FaqSite/content/add-staff.mdx:20-28` | repo上では店舗追加を常時利用可能な仕様としており、FAQの「別店舗から追加」説明は現在のrepo契約と整合する。Production露出は別途未検証。 |
| R-065 | [#730 / r3670616801](https://github.com/yn1323/yps-crispy-carnival/pull/730#discussion_r3670616801) | 2026-07-29 11:52 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | 既存blockerより先にDialogを閉じる | 実装済み | 対象外 | 高 | `src/router.tsx:25-28`<br>`src/hooks/useCloseDialogOnBrowserBack.test.tsx:125-137` | Dialog用のglobal blockerを先に登録し、既存blockerへ渡さずDialogだけを閉じる契約をテストしている。 |
| R-066 | [#730 / r3670616805](https://github.com/yn1323/yps-crispy-carnival/pull/730#discussion_r3670616805) | 2026-07-29 11:52 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | 初回history entryでもBackをDialog closeとして消費する | 実装済み | 対象外 | 高 | `src/hooks/useCloseDialogOnBrowserBack.ts:91-105`<br>`src/hooks/useCloseDialogOnBrowserBack.test.tsx:113-123` | Dialog open時に同一documentのguard entryを追加し、初回entryでもブラウザBackをDialog closeへ変換している。 |
| R-067 | [#732 / r3674832582](https://github.com/yn1323/yps-crispy-carnival/pull/732#discussion_r3674832582) | 2026-07-29 22:44 JST / chatgpt-codex-connector | Closed・未マージ / Unresolved / Current | draft記事URLをsitemapから除外する | 別の方法で解消 | 対象外 | 高 | `scripts/staticSite.ts:75-83`<br>`scripts/validateStaticBuild.ts:167-188` | `_` 始まりのdraft routeをindexable route集合から除外し、build検証でsitemapとindexable canonical route集合の一致を必須化したため、手編集漏れもdeploy前に止まる。 |
| R-068 | [#732 / r3674832590](https://github.com/yn1323/yps-crispy-carnival/pull/732#discussion_r3674832590) | 2026-07-29 22:44 JST / chatgpt-codex-connector | Closed・未マージ / Unresolved / Current | draft化・削除した記事の旧OGP画像を消す | 未実装 | P3 | 高 | `scripts/generateArticleOgp.ts:58-75`<br>`scripts/generateArticleOgp.ts:173-198` | 生成対象からdraftは除外するが、出力先の旧PNGは削除しない。現行metadataからは参照されず、既知の旧URLを直接取得した場合だけ露出する局所的な残骸である。 |
| R-069 | [#733 / r3678703790](https://github.com/yn1323/yps-crispy-carnival/pull/733#discussion_r3678703790) | 2026-07-30 08:24 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 通知予定日の「今日」判定をJST固定にする | 未実装 | P2 | 高 | `src/components/features/UserShopDetail/UserShopNotificationSection.tsx:162-171`<br>`src/components/features/UserShopDetail/UserShopNotificationSection.tsx:245-249` | 現在も実行環境ローカルTZの `dayjs().format("YYYY-MM-DD")` と `dayjs(confirmedAt)` を使い、JST境界へ正規化していない。 |
| R-070 | [#743 / r3681305293](https://github.com/yn1323/yps-crispy-carnival/pull/743#discussion_r3681305293) | 2026-07-30 17:48 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 組織削除中のBackでredirectを失わせない | 実装済み | 対象外 | 高 | `src/components/ui/Dialog/index.tsx:209-240`<br>`src/components/features/OrganizationSettings/OrganizationDeletion/useOrganizationDeletionController.ts:73-88` | busy中はback guardを消費してもDialogを閉じず、削除完了後のredirect callbackを維持する実装になっている。 |
| R-071 | [#746 / r3683958389](https://github.com/yn1323/yps-crispy-carnival/pull/746#discussion_r3683958389) | 2026-07-31 00:21 JST / chatgpt-codex-connector | Merged / Unresolved / Current | デモの日付をビルド日に固定しない | 未実装 | P2 | 高 | `src/components/features/Demo/DemoShiftBoardPage/index.tsx:31-35`<br>`src/components/features/Demo/DemoShiftBoardPage/index.tsx:71-76` | `baseDate` 未指定時は現在も `__BUILD_DATE_JST__` を基準にしており、長期間deployされないと「来週」が過去日になる。 |
| R-072 | [#750 / r3694445759](https://github.com/yn1323/yps-crispy-carnival/pull/750#discussion_r3694445759) | 2026-08-01 11:59 JST / chatgpt-codex-connector | Closed・未マージ / Unresolved / Current | スタッフ数上限をmutation内で強制する | 別の方法で解消 | 対象外 | 高 | `convex/organizationBilling/service.ts:50-85`<br>`convex/staff/mutations.test.ts:325-362` | 固定40人ではなく組織plan別の人数上限へ仕様変更し、mutation transaction内のcapacity検査と副作用なしの拒否テストで直接呼出・競合にも対応した。 |
| R-073 | [#751 / r3695243072](https://github.com/yn1323/yps-crispy-carnival/pull/751#discussion_r3695243072) | 2026-08-01 17:38 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 並行再送後の完了判定を最新stateで行う | 未実装 | P2 | 高 | `src/components/features/Dashboard/NotificationFailureRecovery/index.tsx:108-121`<br>`src/components/features/Dashboard/NotificationFailureRecovery/index.tsx:139-161` | `handleResend` と一括再送は依然として開始時点の `acceptedFailureIds` をclosureで参照し、並行成功をmergeした後のstateでclose判定していない。 |
| R-074 | [#751 / r3695243076](https://github.com/yn1323/yps-crispy-carnival/pull/751#discussion_r3695243076) | 2026-08-01 17:38 JST / chatgpt-codex-connector | Merged / Unresolved / Current | `local:<name>` 形式のConvex deploymentを許可する | 未実装 | P3 | 高 | `scripts/runNotificationDebug.ts:59-73` | 判定は完全一致`local`または`dev:` / `dev/`のみで、標準的な`local:<deployment名>`は拒否される。開発者専用CLIでdev deploymentによる回避も可能なため影響は限定的。 |
| R-075 | [#753 / r3695549837](https://github.com/yn1323/yps-crispy-carnival/pull/753#discussion_r3695549837) | 2026-08-01 20:51 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 接尾辞込みで組織名80文字上限を守る | 未実装 | P2 | 高 | `convex/setup/service.ts:117-120`<br>`convex/migrations/m009_shops_to_organizations.ts:85-90` | 80文字まで許可する店舗名へ接尾辞をそのまま連結しており、初期設定とmigrationの双方で組織名上限を超え得る。 |
| R-076 | [#754 / r3695582238](https://github.com/yn1323/yps-crispy-carnival/pull/754#discussion_r3695582238) | 2026-08-01 21:14 JST / github-advanced-security | Merged / Unresolved / Current | CodeQL: Resend URLのsubstring検査 | 対応不要・見送り | 対象外 | 高 | `convex/contact/httpActions.test.ts:51-62` | 対象はproductionのURL許可判定ではなく、テスト用fetch mockがResend宛リクエストを振り分ける条件であり、任意hostへの送信を許すsinkではない。 |
| R-077 | [#754 / r3695582242](https://github.com/yn1323/yps-crispy-carnival/pull/754#discussion_r3695582242) | 2026-08-01 21:14 JST / github-advanced-security | Merged / Unresolved / Current | CodeQL: multi-character sanitization | 対応不要・見送り | 対象外 | 高 | `scripts/checkDocs.ts:282-291` | 中間置換後に許可文字以外を全除去し、値はHTML出力でなく見出しanchor集合の比較にだけ使うため、`<script>` のelement injection sinkへ到達しない。 |
| R-078 | [#754 / r3695589584](https://github.com/yn1323/yps-crispy-carnival/pull/754#discussion_r3695589584) | 2026-08-01 21:19 JST / chatgpt-codex-connector | Merged / Unresolved / Current | m022を自動migration runnerから外す | 一部実装 | P2 | 高 | `convex/migrations/index.ts:18-43`<br>`.github/workflows/deploy.yml:145-160`<br>[最新Production run](https://github.com/yn1323/yps-crispy-carnival/actions/runs/31295649924) | 行単位guardと限定runnerはあるが、m022は包括runnerに残る。最新Production・Developではmigration series完了扱いのため現在の重大事故ではなく、fresh・復元deploymentでpreflightなしに実行され得る条件付きリスクが残る。 |
| R-079 | [#759 / r3697808778](https://github.com/yn1323/yps-crispy-carnival/pull/759#discussion_r3697808778) | 2026-08-02 13:30 JST / chatgpt-codex-connector | Merged / Resolved / Current | Export整合性判定からheartbeat時刻を外す | 別の方法で解消 | 対象外 | 高 | `convex/analytics/pipeline.ts:4-30`<br>`convex/analyticsDashboard/queryHelpers.ts:359-365`<br>[owner返信](https://github.com/yn1323/yps-crispy-carnival/pull/759#discussion_r3698224582) | 指摘後の修正に加えて旧heartbeat pipeline自体をretireし、現行readの `asOf` はlatest complete runの固定cutoffを返すため、空heartbeatで変動しない。 |
| R-080 | [#760 / r3698458270](https://github.com/yn1323/yps-crispy-carnival/pull/760#discussion_r3698458270) | 2026-08-02 17:50 JST / chatgpt-codex-connector | Merged / Unresolved / Current | m021完走までは `complimentary.pro` を受理する | 実装済み | 対象外 | 高 | [m021先行Production run](https://github.com/yn1323/yps-crispy-carnival/actions/runs/30700098575)<br>[Narrow Production run](https://github.com/yn1323/yps-crispy-carnival/actions/runs/30740593450)<br>`convex/organization/validators.ts:64-89` | m021を含むWiden releaseを先行し、翌日の別releaseでNarrowをdeployしている。両jobの`Deploy Convex`とmigration stepが成功しており、指摘どおり段階releaseされている。 |
| R-081 | [#763 / r3700719374](https://github.com/yn1323/yps-crispy-carnival/pull/763#discussion_r3700719374) | 2026-08-03 09:31 JST / chatgpt-codex-connector | Merged / Unresolved / Current | ログアウト後の保護route再訪をcoreへ戻す | 実装済み | 対象外 | 高 | `e2e/scenarios/auth-logout.test.ts:39-57`<br>`e2e/AGENTS.md:16-26` | 専用actor/contextで実ログアウト後に同じ保護routeを再訪する `E2E-AUTH-02` がcoreに存在する。 |
| R-082 | [#763 / r3700719377](https://github.com/yn1323/yps-crispy-carnival/pull/763#discussion_r3700719377) | 2026-08-03 09:31 JST / chatgpt-codex-connector | Merged / Unresolved / Current | a11y検査の代替suiteをCIへ追加する | 対応不要・見送り | 対象外 | 高 | `e2e/AGENTS.md:26-27`<br>`doc/rules/testing-strategy.md:70-74` | 現行の正式方針はa11y専用E2E/axe走査を追加せず、通常のrole・label・accessible name契約を主担当testで検証すること。指摘とは異なる方針が正本化されている。 |
| R-083 | [#766 / r3704806570](https://github.com/yn1323/yps-crispy-carnival/pull/766#discussion_r3704806570) | 2026-08-03 23:26 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 旧メールcleanupの復旧状態をreload後も保持する | 別の方法で解消 | 対象外 | 高 | `src/components/features/LoginMethods/useLoginMethodsController.ts:653-675`<br>`src/components/features/LoginMethods/useLoginMethodsController.test.tsx:777-814` | 旧session復旧を廃止し、旧メール削除に失敗したら成功扱いせず旧Primaryへrollbackするtransactionalな収束へ置換したため、通常画面へ成功状態で抜ける問題を防ぐ。 |
| R-084 | [#770 / r3717117514](https://github.com/yn1323/yps-crispy-carnival/pull/770#discussion_r3717117514) | 2026-08-05 09:33 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | 追加フロー中のstandalone本人確認Dialogを抑止する | 実装済み | 対象外 | 高 | `src/components/features/LoginMethods/LoginMethodsView.tsx:94-100`<br>`src/components/features/LoginMethods/index.tsx:95-98` | migration Dialog open状態を明示的に渡し、その間はstandalone reverificationを描画しない。 |
| R-085 | [#771 / r3725629323](https://github.com/yn1323/yps-crispy-carnival/pull/771#discussion_r3725629323) | 2026-08-06 12:10 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 旧 `/account/security` を互換routeとして残す | 対応不要・見送り | 対象外 | 高 | [スレッド返信](https://github.com/yn1323/yps-crispy-carnival/pull/771#discussion_r3725635194)<br>`scripts/staticSite.ts:39-50` | 当時未リリースとのowner判断により互換routeは不要として見送られ、現行repoにも旧pathはない。現在のProduction配信履歴とrolling clientの有無は本監査では未検証。 |
| R-086 | [#772 / r3727005813](https://github.com/yn1323/yps-crispy-carnival/pull/772#discussion_r3727005813) | 2026-08-06 17:06 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | CalendarPickerの選択可能日を視認可能にする | 実装済み | 対象外 | 高 | `src/components/features/CreateRecruitmentForm/CalendarPicker.tsx:175-189` | 選択可能日は `teal.100`、hover `teal.200`、選択済みは `gray.200/300` となり、旧 `gray.50` より明確に区別できる。 |
| R-087 | [#772 / r3727005817](https://github.com/yn1323/yps-crispy-carnival/pull/772#discussion_r3727005817) | 2026-08-06 17:06 JST / chatgpt-codex-connector | Merged / Unresolved / Outdated | DateOnlyTableで希望ありセルを識別可能にする | 実装済み | 対象外 | 高 | `src/components/features/Shift/ShiftForm/pc/DateOnlyView/DateOnlyTable.tsx:299-313` | 未割当の希望ありセルには `teal.500` 境界とhover時 `teal.600` 境界があり、希望なしのgray境界と区別できる。 |
| R-088 | [#778 / r3740526109](https://github.com/yn1323/yps-crispy-carnival/pull/778#discussion_r3740526109) | 2026-08-08 19:48 JST / chatgpt-codex-connector | Merged / Unresolved / Current | cutover前の店舗更新を活動時刻へ反映しない | 未実装 | P2 | 高 | `convex/analytics/projection.ts:210-224`<br>`convex/analytics/reset.ts:533-554` | resetで `latestActivityAt` を消しても、replayされた `shop.changed` は `dataStartAt` と比較せず `occurredAt` を再設定するため、cutover前活動が復活する。 |
| R-089 | [#780 / r3741228515](https://github.com/yn1323/yps-crispy-carnival/pull/780#discussion_r3741228515) | 2026-08-09 02:42 JST / chatgpt-codex-connector | Merged / Unresolved / Current | cleanup未確認時にpendingを解除しない | 未実装 | P2 | 高 | `src/components/features/LoginMethods/useLoginMethodsController.ts:373-401` | `reloadUser()` が失敗してcatchへ入ると、既知のpending状態でも最終的に `setGoogleDisconnectPendingCleanup(false)` を実行する。 |
| R-090 | [#785 / r3744568506](https://github.com/yn1323/yps-crispy-carnival/pull/785#discussion_r3744568506) | 2026-08-10 02:06 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 非表示badgeのgrid cell自体を取り除く | 未実装 | P3 | 高 | `src/components/shared/OrganizationPersonRow/index.tsx:33-39`<br>`src/components/shared/OrganizationPersonRow/index.tsx:63-90` | 列数は減るが3個の`Flex` cellは常に描画され、両表示false時に空cellが改行される。行高・位置の局所的なレイアウト崩れで、操作は継続できる。 |
| R-091 | [#785 / r3744568509](https://github.com/yn1323/yps-crispy-carnival/pull/785#discussion_r3744568509) | 2026-08-10 02:06 JST / chatgpt-codex-connector | Merged / Unresolved / Current | ページ見出しと戻る操作のaccessible nameを分ける | 未実装 | P2 | 高 | `src/components/ui/DetailPageHeader/index.tsx:24-50` | `h1` の唯一の子が戻るButtonのままで、`backAriaLabel` がButtonのnameを置換するため、headingも操作文として露出する構造が残る。 |
| R-092 | [#786 / r3756553789](https://github.com/yn1323/yps-crispy-carnival/pull/786#discussion_r3756553789) | 2026-08-11 17:58 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 削除済みスタッフ履歴を一括変更上限から分離する | 未実装 | P2 | 高 | `convex/staff/service.ts:95-107`<br>`convex/staff/service.ts:151-165` | 組織全体を `isDeleted` 無指定で201件まで読み、上限超過なら現所属を絞る前に `null` を返すため、削除履歴だけで画面を利用不能にできる。 |
| R-093 | [#787 / r3763000171](https://github.com/yn1323/yps-crispy-carnival/pull/787#discussion_r3763000171) | 2026-08-12 10:41 JST / chatgpt-codex-connector | Merged / Unresolved / Current | 削除する将来シフト割当件数を送信前に表示する | 未実装 | P1 | 高 | `src/components/features/ShopDetail/ShopStaffMembershipDialog.tsx:257-274`<br>`src/components/features/ShopDetail/ShopStaffMembershipDialog.tsx:411-429` | ready previewを受け取ると件数を描画せずeffectで自動送信する。件数表示は `tooMany`（501件以上）の拒否時だけで、通常の1〜500件は確認不能。 |
| R-094 | [#787 / r3763000173](https://github.com/yn1323/yps-crispy-carnival/pull/787#discussion_r3763000173) | 2026-08-12 10:41 JST / chatgpt-codex-connector | Merged / Unresolved / Current | inline確認を閉じた後もBrowser Back guardを再登録する | 未実装 | P2 | 高 | `src/hooks/useCloseDialogOnBrowserBack.ts:59-88`<br>`src/components/ui/Dialog/index.tsx:209-240` | back handlerはcallback前にDialog登録を除去し、外側 `isOpen` がtrueのままのinline確認解除ではeffectが再実行される依存変更がない。次のBackがページ遷移へ抜ける。 |

## 8. 制約と変更範囲

GitHubの取得は2026年8月12日13時38分29秒JSTのスナップショットである。
同日14時28分JSTにPR更新時刻とrepo-wide inline commentを再確認し、取得後に更新されたPRや追加inline commentがないことを確認した。
ただし、同日24時までの未来の投稿は当然ながら含められない。

Production database、Preview、外部provider、feature flagの実値には接続していない。
GitHub Actionsはread-onlyで実行metadataとstep logを確認し、Production releaseの順序と結果だけを根拠に加えた。
ローカルの未コミット変更は判定根拠に使わず、GitHubのdefault branch objectを参照した。

本監査ではコード、テスト、設定、GitHubのコメント・レビュー・スレッド状態を変更していない。
成果物としてこの監査文書と`doc/archive/INDEX.md`の時点監査登録だけを追加した。
監査実施時点ではcommit、push、PR作成を行っていない。

## 9. 主な参照先

- `AGENTS.md`
- `doc/rules/testing-strategy.md`
- `doc/rules/security-strategy.md`
- `doc/rules/convex-design-strategy.md`
- `doc/manual/release-status.md`
- `.github/workflows/release.yml`
- `doc/features/notification-outbox.md`
- `doc/features/shop-settings.md`
- `doc/features/shift-exclusion.md`
- `convex/_generated/ai/guidelines.md`
- 詳細台帳に記載した各現行ファイル、テスト、文書、GitHub thread

# トライアル終了前のDashboard案内 実装計画

> 文書種別: plan（実装計画）  
> 作成日: 2026-10-17  
> 状態: Active（repository implemented・計測と実環境での確認待ち）

## 背景と判断

有料プランの継続を登録していないTrialの組織は、「プランと支払い」を自分で開かない限り、予告なくFreeへ移る状態だった。  
以前のDashboardには残り7日から出す案内があったが、PR #852 でプラン表示の整理と一緒に削除され、「契約画面と既存の通知経路を正本にする」と記録された。  
シフトリにはTrial終了の通知経路がなく、Trial中は支払い方法を登録しないためStripeからのメールも届かない。

TrialはPro相当（50名）で2か月続き、終了するとFree（5名・1店舗・管理者2名）になる。  
上限を超えると、管理者の通常操作に加えてスタッフの希望シフト提出と通知も止まる。  
シフト募集は1〜2週間単位で提出期限が先にあるため、次の募集を作る前に判断できる時期に案内する必要がある。

このため、終了14日前からDashboard上部で段階的に案内することにした。  
シフトリから課金メールを送らない方針（業務要件10.3）は変えない。

## 時期と内容の根拠

何日前の案内が最も効果的かを比べた公開の比較実験は見つからなかった。  
他社の目安は、14日トライアルで5〜7日前、7日トライアルで3〜5日前であり、長いトライアルでは1週間前から案内する運用もある。  
GitLabは残り14〜7日と残り3日以下の2段階で、課金操作ができる管理者に出す実験を計画していた。  
マネーフォワードはホーム画面にトライアルの残り日数を出し、終了後に有料プランの申し込みを案内している。  
内容については、終わると何が起きるかを明確に書くことが共通して勧められている。

2か月のトライアルとシフト募集の周期を踏まえ、残り14日、残り7日、最終日の3段階とした。  
段階と閉じ方の詳細は[Dashboardの課金案内](../features/trial-ending-dashboard-callout.md)を正本とする。

## 実装

| 対象 | 内容 |
|---|---|
| `convex/organizationBilling/service.ts` | 現在の実利用数をFree上限で評価する`evaluateTrialEndFreeLimitStatus`を追加した。結果は保存しない |
| `convex/dashboard/queries.ts` | `getDashboardShop`へ、未契約Trialだけの`trialEnding`（終了時刻とFree上限の評価）を追加した |
| `src/components/features/Dashboard/TrialEndingNotice/` | 段階と文言の純粋関数、境界での再評価と閉じた状態のhook、Alertの表示、Storybookを追加した |
| `src/pages/dashboard/index.tsx` | 支払い失敗の案内の下に表示し、「プランを選ぶ」から「プランと支払い」へ進める |

新しいpublic functionとtableは追加していない。  
「後で確認する」で閉じた残り14日の段階だけを、組織とTrial終了時刻を含むキーでlocalStorageへ保存する。

## テスト

| 契約 | 層 | 配置 |
|---|---|---|
| 未契約Trialだけに終了時刻とFree上限の評価を返し、継続登録済みには返さない | Convex Function | `convex/dashboard/queries.test.ts` |
| 段階の境界、次の境界、上限超過・上限内・評価不能の文言と強さ、最終日だけ閉じられない | Logic | `src/components/features/Dashboard/TrialEndingNotice/script.test.ts` |
| 残り14日の案内を閉じると同じ組織で非表示になり保存される、最終日は閉じられない、期間前は表示しない | Behavior / VRT | `src/components/features/Dashboard/TrialEndingNotice/index.stories.tsx` |
| Dashboardに表示し、「プランを選ぶ」で「プランと支払い」へ進む | Frontend Unit | `src/pages/dashboard/index.test.tsx` |

## 残る課題

- 案内の表示と「プランを選ぶ」の押下はまだ計測していない。  Web計測のイベント種別の追加はGTM側の設定と文書を伴うため、別作業で行う。
- 最適な日数は資料から決めきれないため、計測後にTrialから有料への移行率を見て調整する。
- トライアル終了日をまたぐシフト募集の作成時に案内する案は、効果を見てから判断する。
- VRT基準画像の承認、CI、実環境への反映は未実施である。

## 参考

- `convex/dashboard/queries.ts`
- `convex/organizationBilling/service.ts`
- `convex/organizationBilling/policy.ts`
- `convex/organizationBilling/planLimits.ts`
- `src/pages/dashboard/index.tsx`
- `src/components/shared/OrganizationPaymentFailureAlert/index.tsx`
- `doc/features/trial-ending-dashboard-callout.md`
- `doc/specs/organization-billing-business-flow.md`
- `doc/plans/2026-08-11_Dashboardプランカード_利用状況表示と配色統一_実装計画.md`
- [Trial expiration email best practices (Bento)](https://bentonow.com/posts/trial-expiration-email-best-practices)
- [How to set up trial expiration emails (Sequenzy)](https://sequenzy.com/blog/how-to-set-up-trial-expiration-emails)
- [GitLab: Implement trial reminder as trial gets close to expiring](https://gitlab.com/gitlab-org/gitlab/-/issues/334936)
- [マネーフォワード クラウド確定申告 お知らせ（トライアル残日数表示）](https://biz.moneyforward.com/support/tax-return/?p=24843)

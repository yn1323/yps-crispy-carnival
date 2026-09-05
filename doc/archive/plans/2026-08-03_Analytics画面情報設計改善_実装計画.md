# Analytics画面情報設計改善 実装計画

> Archive日: 2026-09-05
>
> 理由: `superseded`
>
> 後継: [日次利用指標](../../features/analytics.md)、[問い合わせ閲覧](../../features/analytics-dashboard.md)

作成日: 2026-08-03  
状態: completed  
対象: `apps/analytics-dashboard/`の情報設計、表示状態、文言、一覧、詳細画面  
関連計画: [分析KPIと内部BI再設計](2026-08-02_分析KPIと内部BI再設計_実装計画.md)

## 1. 結論

現行Analyticsは、分析値を正確に表示するためのデータ契約を実装できている。  
しかし、集計状態、分析条件、主要KPI、補助指標、詳細表を同じ強さで並べているため、画面を開いた利用者が最初に判断すべき内容を特定しにくい。

この計画では、Convexの分析基盤、BFF API、DTO、計算式を変更せず、既存データを次の判断順へ並べ直す。

1. 現在、確認が必要なことを把握する。
2. 全体の利用状況と導入状況を確認する。
3. 対象のグループまたは店舗へ移動する。
4. 必要な場合だけ、集計条件、詳細指標、セグメント、周期を開く。

初期表示で値を出せない場合は、大きな空グラフや多数の「算出不可」カードを表示しない。  
値を出せない理由と、いつ何がそろえば確認できるかを短く示す。

## 2. 現状と前計画の関係

[分析KPIと内部BI再設計](2026-08-02_分析KPIと内部BI再設計_実装計画.md)は、復元不能な値を推測せず、`complete`、`partial`、`unavailable`を区別することを優先した。  
現行実装はその契約に沿い、データ開始日、完全性、主要KPI、導入到達度、health signal、比較表を表示している。

一方、前計画のUI構成は、画面へ載せる情報を列挙するところまでで、各画面の主作業、値が少ない期間の縮退表示、一覧の主要列、詳細情報を開く順序を固定していなかった。  
そのため、実装では列挙された情報がほぼすべて初期表示されている。

確認した現行画面には、次の症状がある。

- データ蓄積開始が2026-08-03である一方、URL指定がない初期期間は直近30日、比較期間はその直前30日になる。
- 初期表示だけで、蓄積開始前の警告、比較不能、算出不可、空の推移が同時に現れる。
- グループ一覧は11列、店舗一覧は14列あり、一行の意味を横方向に追う必要がある。
- 店舗詳細は周期が0件でも、空グラフ、累積KPI、期間KPI、周期一覧をすべて展開する。
- グループ詳細は1店舗だけでも、多店舗展開の算出不可カードと空グラフを表示する。
- ページ上部の「一部集計」、行の「完全」、指標の「算出不可」、signalの「判定材料不足」が同時に表示されるが、それぞれの対象範囲が説明されない。
- `/requests`は分析pipelineと独立した画面であるにもかかわらず、共通の`DataStatus`を表示している。
- 比較期間と集計粒度は、値へ反映しない一覧画面でも操作できる。

今回の計画は前計画を置き換えない。  
前計画が所有する分析契約とrolloutを維持したまま、内部BIの表示契約だけを改善する。

## 3. 利用者と画面の主作業

利用者は、シフトリの状態を定期的に確認する内部担当者一人を主対象とする。  
主な利用端末はデスクトップとし、モバイルでは比較表を縮小表示せず、主要情報をカードとして読める状態を保証する。

各routeの主作業を次のように固定する。

| route | 主作業 | 補助作業 |
|---|---|---|
| `/` | 現在の要確認事項を把握し、次に見る対象を選ぶ | KPI推移、導入状況、セグメントを見る |
| `/organizations` | グループ間の差を比較し、詳細対象を選ぶ | プラン、期間、並び順を変える |
| `/organizations/:organizationId` | グループ内で差が生じている店舗を特定する | 人員内訳、多店舗展開、推移を見る |
| `/shops` | 要確認店舗を絞り込み、詳細対象を選ぶ | グループ、状態、期間、並び順を変える |
| `/shops/:shopId` | 店舗の現在の問題、導入到達、次回シフトを把握する | 推移、累積値、周期を見る |
| `/shops/:shopId/cycles/:recruitmentId` | 一つの周期で提出、通知、確定のどこに問題があるか確認する | 完全性と時刻の根拠を見る |
| `/requests` | 届いた要望を新しい順に読む | 次の50件を読み込む |

## 4. 変更範囲

### 4.1 対象

- ナビゲーションの優先順位とラベル
- データ更新情報と警告の表示方法
- URL指定がない場合の初期期間
- 画面ごとに有効な分析条件だけを表示する制御
- 全体画面のsection順と初期取得範囲
- グループ、店舗、周期一覧の主要列
- 値が不足しているグラフ、KPI、詳細sectionの縮退表示
- 実装用語を内部担当者が判断できる言葉へ置き換える表示層
- デスクトップ表とモバイルカードの情報順
- `/requests`からAnalytics pipeline状態を取り除く変更
- 現行機能文書の追従更新

### 4.2 対象外

- Convex schema、table、index、generation、job、cron、retentionの変更
- Analytics集計値、KPI定義、率の分子・分母、完全性判定の変更
- `convex/analyticsDashboard/`のquery、DTO、validator、HTTP Actionの変更
- Worker BFF endpointと認証境界の変更
- Production、Dev、localのConvex DBへの書き込みまたは運用function実行
- 店舗名、グループ名の全page横断検索
- 要望の分類、対応状態、担当者、編集機能
- Analytics frontend test、Convex test、Storybook、VRT、E2Eの追加または更新

店舗名とグループ名の検索は、現在のcursor APIに検索queryがないため対象外とする。  
表示中の50件だけを検索するUIは、全件検索と誤認しやすいため追加しない。  
全件検索が必要になった場合は、検索契約とindexを別計画で設計する。

## 5. 目標となる情報構造

### 5.1 ナビゲーション

主navigationは「サマリー」「グループ」「店舗」とする。  
分析pipelineから独立した「要望」は、同じheader内でも余白または区切りを設けた補助navigationとして扱う。

現在のdeploymentを表す`env.label`は、各ページの本文ではなくheaderの小さな環境表示へ移す。  
環境表示は接続先の確認に必要だが、分析結果より強く見せない。

`AI向けJSONLを出力`はページ見出しの主操作から外す。  
「データを書き出す」という補助操作として、サマリー上部の弱いボタンまたは詳細操作領域へ移す。

### 5.2 全体画面

全体画面は次の順にする。

1. ページ見出しと短い更新情報
2. 「今見るべき店舗」
3. 現在の利用状況
4. 期間と比較条件
5. データが成立している場合だけKPI推移
6. 導入到達度と要確認状態
7. 初期状態では閉じた詳細分析
8. グループ一覧と店舗一覧への導線

「今見るべき店舗」は、既存の`health=needsAttention`取得結果から最大5件を表示する。  
店舗名、主な要確認状態、次回シフト、最終活動日だけを主表示にする。

グループ比較表は全体画面から削除し、グループ一覧への件数付き導線へ置き換える。  
セグメント比較は「詳細分析」として閉じ、開いたときだけqueryを開始する。  
初期表示で全dimensionを並べず、一つの比較軸を選んで表示する。

### 5.3 一覧画面

グループ一覧の主要列は最大6列とする。

1. グループ
2. 稼働店舗数と総店舗数
3. スタッフ所属数とシフト対象人数
4. 管理者数
5. 開始前確定周期率
6. 要確認状態

`unique person`、person未接続数、管理者兼スタッフ数はグループ詳細の人員内訳へ移す。  
行のcompletenessが`complete`の場合は「完全」badgeを表示せず、`partial`または`unavailable`の場合だけ行内に理由を示す。

店舗一覧の主要列は最大7列とする。

1. 店舗
2. 導入到達
3. スタッフ所属数とシフト対象人数
4. 次回シフト
5. 最終提出率
6. 要確認状態
7. 最終活動日

プランとグループは店舗名の補助情報として残す。  
LINE連携率、通常周期、人物数、管理者数、person未接続数、管理者兼スタッフ数は店舗詳細へ移す。

一覧のpagination文言は、通常時を「次の50件」、filter候補pageが0件の場合を「次の候補を確認」と分ける。  
総件数はAPIが返さないため推測しない。

デスクトップでは表を使い、モバイルでは同じ列を横へ詰め込まず、対象名、要確認状態、主要数値、詳細導線を縦に並べたカードへ切り替える。

### 5.4 グループ詳細

最初に表示する情報は、店舗数、稼働店舗数、スタッフ所属数、要確認店舗とする。  
人物数、未接続スタッフ、シフト対象人数、管理者、管理者兼スタッフは「人員内訳」へまとめ、初期状態では閉じる。

所属店舗が1店舗の場合、多店舗展開の2枚の算出不可カードは表示しない。  
「2店舗目の登録後に多店舗展開の指標を表示します」という一行の対象外表示へ置き換える。

推移グラフは、いずれかの指標に描画可能な値が2点以上ある場合だけ表示する。  
条件を満たさない場合は固定高の空グラフを作らず、「推移は2日分以上の集計後に表示されます」と表示する。

グループ内店舗一覧は、店舗一覧のうちグループ内比較に必要な6列へ絞る。

### 5.5 店舗詳細

最初に表示する情報は、現在の要確認状態、導入到達履歴、次回シフト、スタッフ所属数と対象人数とする。  
LINE連携と人物内訳は補助情報として同じsection内にまとめる。

推移グラフはグループ詳細と同じ描画条件を使う。  
描画可能な値が2点未満なら、固定高のchartを表示しない。

累積周期数が0の場合、累積KPI9枚を表示しない。  
「集計対象となるシフト周期がまだありません」という空状態と、初回募集または初回確定の到達状況を表示する。

累積周期が存在する場合も、累積KPIは次の二段階に分ける。

- 主表示：作成周期、確定周期、開始前確定周期、最終提出率
- 詳細表示：期限内提出率、通知、確定までの時間

期間KPIは、対象周期がある場合だけカード表示する。  
対象周期が0の場合は`0 / 0`カードを並べず、対象期間に完全な周期がないことを一行で示す。

店舗本体のqueryが完了したら、周期一覧のquery完了を待たずにページ上部を表示する。  
周期一覧のloadingとerrorは、そのsection内だけで扱う。

### 5.6 要望画面

`/requests`から`DataStatus`を削除する。  
これは[分析KPI可視化アプリ](../../features/analytics-dashboard.md)の「pipeline状態を表示しない」という現行仕様との不一致修正でもある。

見出しは「届いた要望」、説明は「要望フォームから届いた内容を新しい順に表示します」とする。  
現在の受付日時、店舗、送信者区分、本文は維持する。

デスクトップは表、モバイルは受付日時と店舗を先頭にしたカード表示とする。  
分類や対応状態はAPIに存在しないため、この変更では追加しない。

## 6. 表示状態の契約

### 6.1 集計状態と指標の計算可否

ページ全体の集計状態と、個別指標の計算可否を別の表示にする。

| API状態 | ページ上部 | 個別指標 |
|---|---|---|
| `complete` | 最新集計日時だけを短く表示 | 値を表示し、完全badgeは付けない |
| `partial` | 「一部の集計が未完了です」と警告 | 不完全な値だけ理由付きで除外する |
| `pending` | 「初回集計中です」と案内 | 値の代わりに集計中の説明を出す |
| `unavailable` | 選択期間を確認する案内 | 「算出できません」と理由を出す |
| API error | 失敗したsectionに再取得案内 | 0へ置換しない |

`DataStatus`は環境名、日付、警告をすべてbadgeで並べる構成をやめる。  
通常時は「2026/08/03時点、集計完了14:06」のような一行にし、蓄積開始日と警告詳細は開閉領域へ置く。

警告は`/`で連結した一文にせず、一件ずつ箇条書きで表示する。  
利用者が変更できる期間警告は分析条件の近く、pipeline停止など利用者が変更できない警告はページ上部に置く。

### 6.2 初期期間

URLに`from`と`to`が明示されている場合は、その指定を変更しない。  
URL指定がない場合だけ、response metadataを使って初期期間を補正する。

1. 終了日は`latestCompleteSnapshotDate`を優先し、未集計なら当日を使う。
2. 開始日は「終了日の29日前」と`dataStartDate`の遅い方を使う。
3. 同じ長さの直前期間が`dataStartDate`以降へ完全に収まる場合だけ、比較期間を有効にする。
4. 比較期間が成立しない場合は比較入力を空にし、「比較できる過去データがまだありません」と表示する。
5. 自動補正は`history.replaceState`で反映し、利用者の履歴を増やさない。
6. 同じmetadataで補正を繰り返さないよう、補正関数を冪等にする。

初回queryでmetadataを取得するまでは、現在の安全な既定期間で取得してよい。  
metadata取得後の補正では、警告だけを見せたままにせず、補正後のqueryへ切り替える。

### 6.3 画面ごとの分析条件

画面が利用しない条件を表示しない。

| route | 表示する条件 |
|---|---|
| `/` | 期間、任意の比較、粒度、scope、詳細分析の比較軸 |
| `/organizations` | 期間、プラン、並び順 |
| `/organizations/:organizationId` | 期間、粒度 |
| `/shops` | 期間、グループ、プラン、店舗規模、通常周期、LINE利用、要確認状態、並び順 |
| `/shops/:shopId` | 期間、粒度。周期の完全性は周期section内へ分離 |
| cycle詳細 | 原則なし |
| `/requests` | なし |

比較期間を使わない一覧・詳細画面で比較期間入力を表示しない。  
粒度を使わない一覧画面で粒度入力を表示しない。

条件は初期状態で、適用中の期間と絞り込みを一行で要約する。  
変更操作は「条件を変更」で開き、未変更時に大きなformを常時表示しない。

## 7. 用語と文言

内部の型名はデータ契約に残し、主表示だけを次の言葉へ置き換える。

| 現在の主表示 | 変更後 | 補足説明 |
|---|---|---|
| `unique person` | 重複を除いた利用者 | グループ内で同一人物を重複計上しない人数 |
| `person未接続staff` | 重複判定できないスタッフ | 人物情報へ安全に接続できず、実人数へ含めていないスタッフ |
| `staff membership` | スタッフ所属 | 複数店舗所属は店舗ごとに1件 |
| `manager membership` | 管理者所属 | 現在有効な管理者権限 |
| `managerStaff` | 管理者兼スタッフ | 管理者とスタッフの両方として所属する利用者 |
| `health signal` | 要確認状態 | 一店舗に複数成立する場合がある |
| `cycle` | シフト周期 | 一回の募集対象期間 |
| `cohort` | 登録時期または導入時期 | 比較軸に応じて使い分ける |
| `snapshot` | 集計日時点 | 詳細説明だけで使う |
| `lead time` | 確定までの時間 | 作成から確定までの経過時間 |
| `completeness` | 集計状態 | page、row、metricの対象範囲を併記する |

`business`、`free`、`pro`などの内部値は、画面では`Business`、`Free`、`Pro`へ統一する。  
JSONLとAPIのfield名は変更しない。

## 8. 実装境界

既存componentを次の責務へ整理する。

| 現行ファイル | 変更内容 |
|---|---|
| `src/components/layout/AppShell.tsx` | 主navigation、補助navigation、環境表示を整理する |
| `src/features/analytics/DataStatus.tsx` | 通常時の短い更新情報、警告分類、開閉詳細を実装する |
| `src/features/analytics/AnalysisControls.tsx` | route別field構成、適用中条件の要約、比較の任意化を実装する |
| `src/features/analytics/useAnalyticsSearch.ts` | URL明示判定、metadataに基づく初期期間補正、route別不要parameter除去を実装する |
| `src/features/analytics/OverviewView.tsx` | 要確認店舗を先頭へ移し、グループ表を削除し、詳細分析を遅延表示する |
| `src/pages/OverviewPage.tsx` | 初期queryからグループ比較を外し、セグメントqueryを開いた時だけ有効にする |
| `src/features/analytics/AnalyticsTables.tsx` | 用途別の主要列とモバイル表示を定義する |
| `src/components/DataTable.tsx` | desktop tableと任意のmobile row rendererを受け持つ。業務列は持たない |
| `src/features/analytics/OrganizationDetailView.tsx` | 主要値、人員内訳、多店舗対象外、推移不足を分ける |
| `src/features/analytics/ShopDetailView.tsx` | 現在の要確認状態を先頭へ移し、0周期時のsectionを縮退する |
| `src/pages/ShopDetailPage.tsx` | 店舗本体と周期一覧のloading、error境界を分離する |
| `src/features/analytics/adapters.ts` | 表示用語、主要KPI、描画可能判定に必要なViewModelを組み立てる |
| `src/components/TrendChart.tsx` | 空データの理由を外側から渡せるようにし、描画可能条件をView側で判断する |
| `src/pages/RequestsPage.tsx` | `DataStatus`を削除する |
| `src/features/requests/RequestsView.tsx` | 見出しに合う一覧とモバイルカードを表示する |

新しい共通componentは、更新情報、状態付きsection、モバイル行のいずれかの責務を持つ場合だけ追加する。  
propsを転送するだけのwrapperは作らない。

## 9. 実装順序

### Phase 1: 表示契約と初期期間

- page、row、metricの状態ラベルを分離する。
- `complete` badgeの反復表示を削除する。
- warningを種類ごとに表示する。
- URL明示の有無を保持し、metadataから初期期間を補正する。
- 画面ごとに使わない条件を非表示にする。
- 適用中条件の要約と開閉式formを実装する。

完了条件:

- URL指定なしで、蓄積開始前を含む初期期間が選ばれない。
- 比較可能な期間がない場合、比較入力と比較不能メッセージが大量に反復されない。
- 値へ反映しないinputが各routeからなくなる。
- pageの`partial`とrowの`complete`が同じラベル列で競合しない。

### Phase 2: 全体画面

- 要確認店舗を最初の判断sectionへ移す。
- 現在値のKPIを、率と店舗数の意味が分かる順へ並べる。
- 描画可能な推移がない場合はchartを縮退する。
- グループ比較表を削除して一覧への導線へ置き換える。
- セグメント比較を閉じた詳細分析へ移し、開くまで取得しない。
- JSONL出力を補助操作へ移す。

完了条件:

- 最初のviewportで、要確認店舗または「要確認店舗なし」を判断できる。
- 初期表示でグループ比較queryとセグメントqueryを実行しない。
- 1日分しかない場合、大きな空グラフを表示しない。
- 全体画面からグループ、店舗の詳細導線が失われない。

### Phase 3: グループ・店舗一覧

- グループ一覧を6列以内へ整理する。
- 店舗一覧を7列以内へ整理する。
- `complete`列を削除し、不完全時だけ行内表示する。
- 用途別に、全体の要確認店舗、グループ内店舗、店舗比較の列を分ける。
- モバイルでは主要情報をカード表示する。
- pagination文言を通常pageとfilter候補pageで分ける。

完了条件:

- デスクトップで主要情報を横スクロールせず比較できる。
- モバイルで表の横幅を追わず、対象名、状態、詳細導線を読める。
- 詳細へ移した指標は、対応する詳細画面で確認できる。
- `0`、未集計、算出不能を同じ表示へ変換しない。

### Phase 4: グループ・店舗詳細

- グループ詳細の現在値を主要値と人員内訳へ分ける。
- 1店舗グループの多店舗展開を対象外表示へ縮退する。
- 店舗詳細の要確認状態と導入到達を先頭へ移す。
- 0周期時の累積KPI、期間KPI、周期一覧を一つの空状態へ整理する。
- 推移の描画可能条件を共通化する。
- 店舗本体と周期一覧のloading、errorを分離する。

完了条件:

- 1店舗グループで多店舗展開の算出不可カードを表示しない。
- 0周期店舗で空グラフと多数の算出不可カードを表示しない。
- 周期一覧取得中でも、店舗名、現在値、導入到達を確認できる。
- 周期がある店舗では既存の詳細値と周期詳細導線を維持する。

### Phase 5: Navigation、要望、文書

- navigationラベルと優先順位を更新する。
- environment labelをheaderへ移す。
- `/requests`からpipeline状態を削除する。
- 要望一覧のモバイル表示を追加する。
- `doc/features/analytics-dashboard.md`を実装結果へ更新する。
- この計画の状態と実装結果を更新する。

完了条件:

- 要望画面に蓄積開始日、最新完全日、completenessを表示しない。
- 主navigationと補助navigationの役割が視覚的に区別される。
- 機能文書とroute、表示状態、初期期間が一致する。

## 10. 受入条件

- サマリーを開いた最初のviewportで、現在の要確認対象と次の遷移先が分かる。
- URL指定がない初期期間は`dataStartDate`より前へ広がらない。
- 明示URLで蓄積開始前を選んだ場合は指定を保持し、値がない区間を0として描かない。
- 比較期間が成立しない場合、比較UIを無効な初期値のまま表示しない。
- 各routeに、結果へ影響しない分析条件がない。
- 通常状態のページで「完全」badgeを大量に反復しない。
- `partial`、`pending`、`unavailable`、正確な0、filter結果0件、API errorを区別する。
- グループ一覧は6列以内、店舗一覧は7列以内で主要判断を完了できる。
- 1店舗グループ、1日分の推移、0周期店舗が大きな空領域を作らない。
- 店舗本体の表示が周期一覧queryにブロックされない。
- `/requests`はAnalytics pipeline状態を表示しない。
- API、DTO、KPI計算、JSONL field、BFF、Convex DBを変更しない。
- Analytics frontend test、Convex test、Storybook、VRT、E2Eを追加または更新しない。
- 現行checkoutにある依頼外の変更を保持する。

## 11. 検証

`apps/analytics-dashboard/AGENTS.md`に従い、次の静的検証を実行する。

```bash
pnpm analytics:lint
pnpm analytics:type-check
pnpm analytics:build
pnpm docs:check
```

Analytics frontend test、Convex test、Storybook、VRT、E2Eは追加、更新、実行しない。  
AI Agentによるブラウザ手動確認を完了条件へ含めない。

自己レビューでは、次を確認する。

- 表示されるinputが、そのrouteのrequest parameterへ実際に反映される。
- URL明示期間を自動補正で上書きしない。
- `dataStartDate`または`latestCompleteSnapshotDate`がnullでも無限更新しない。
- 空グラフを隠したことで、取得失敗まで空状態へ変換していない。
- `complete`を隠したことで、`partial`と`unavailable`の警告まで消していない。
- mobile rendererとdesktop tableで、値の意味と詳細routeが一致する。
- exportのrecord、field、取得対象を変更していない。
- `convex/`、Worker、環境変数、DBへ変更がない。

実画面の最終的な読みやすさは、利用者が`localhost:3001`で受入確認する。  
フィードバックがある場合は、実際に表示された画面を基準に後続修正する。

## 12. リスクとrollback

初期期間の自動補正はURL状態を変更するため、明示指定と既定値の判別を誤ると共有URLを壊す。  
URLに期間parameterがある場合は一切補正せず、補正は`replaceState`だけで行う。

一覧列を減らすと既存の詳細値を探しにくくなる可能性がある。  
削除する値は対応する詳細画面へ必ず残し、一覧から詳細への行選択を維持する。

sectionの遅延取得は、開いた直後のloadingと失敗境界を新しく生む。  
全体pageをloadingへ戻さず、対象sectionだけにloadingと再試行表示を置く。

表示だけの変更なので、rollbackはAnalytics appの該当revisionを戻す。  
DB、generation、snapshot、BFF APIのrollbackは発生しない。

## 13. 参考にしたファイル

規約と機能文書:

- `AGENTS.md`
- `apps/analytics-dashboard/AGENTS.md`
- `doc/rules/ui-design.md`
- `doc/features/analytics-dashboard.md`
- `doc/features/analytics.md`
- `doc/plans/2026-08-02_分析KPIと内部BI再設計_実装計画.md`

現行実装:

- `apps/analytics-dashboard/src/app/App.tsx`
- `apps/analytics-dashboard/src/routes/appRoute.ts`
- `apps/analytics-dashboard/src/components/layout/AppShell.tsx`
- `apps/analytics-dashboard/src/components/DataTable.tsx`
- `apps/analytics-dashboard/src/components/KpiCard.tsx`
- `apps/analytics-dashboard/src/components/ChartPanel.tsx`
- `apps/analytics-dashboard/src/components/TrendChart.tsx`
- `apps/analytics-dashboard/src/features/analytics/DataStatus.tsx`
- `apps/analytics-dashboard/src/features/analytics/AnalysisControls.tsx`
- `apps/analytics-dashboard/src/features/analytics/OverviewView.tsx`
- `apps/analytics-dashboard/src/features/analytics/OrganizationsView.tsx`
- `apps/analytics-dashboard/src/features/analytics/ShopsView.tsx`
- `apps/analytics-dashboard/src/features/analytics/OrganizationDetailView.tsx`
- `apps/analytics-dashboard/src/features/analytics/ShopDetailView.tsx`
- `apps/analytics-dashboard/src/features/analytics/AnalyticsTables.tsx`
- `apps/analytics-dashboard/src/features/analytics/adapters.ts`
- `apps/analytics-dashboard/src/features/analytics/useAnalyticsSearch.ts`
- `apps/analytics-dashboard/src/pages/OverviewPage.tsx`
- `apps/analytics-dashboard/src/pages/ShopDetailPage.tsx`
- `apps/analytics-dashboard/src/pages/RequestsPage.tsx`
- `apps/analytics-dashboard/src/features/requests/RequestsView.tsx`

## 14. 実装結果

2026-08-03にPhase 1からPhase 5までを実装した。  
変更はAnalytics frontendと現行機能文書に限定し、Convex schema、table、query、pipeline、BFF API、DTO、KPI計算式、JSONL fieldを変更していない。

表示契約と初期期間では、URLに`from`と`to`がない場合だけmetadataから期間を補正し、蓄積開始日前へ広がらないようにした。  
比較期間は直前の同じ長さの期間が蓄積範囲へ収まる場合だけ設定し、routeごとに結果へ影響する条件だけを表示する。

サマリーでは要確認店舗を先頭へ移し、初期queryからグループ比較とsegment比較を外した。  
segment比較は「詳細分析」を開いた場合だけ取得し、グループと店舗の一覧routeへの導線を残した。

一覧ではグループを6列、店舗を最大7列へ整理した。  
`complete`の反復badgeを削除し、`partial`または`unavailable`だけを行内へ表示する。  
主要一覧、シフト周期、segment、要望にはモバイルカード表示を追加した。

詳細では、グループの人員内訳と店舗の補助KPIを開閉領域へ移した。  
1店舗グループ、描画可能な値が2点未満の推移、正確に0周期の店舗は、固定高の空表示や多数の「算出できません」カードを作らない。  
店舗本体と周期一覧のloading、error境界を分離し、周期一覧の取得中または失敗時も店舗上部を表示する。

navigationは「サマリー」「グループ」「店舗」を主navigationとし、「要望」を区切った補助navigationへ移した。  
`env.label`は共通headerへ表示し、`/requests`からAnalytics pipelineの`DataStatus`を削除した。

| 検証 | 結果 |
|---|---|
| `pnpm analytics:lint` | 成功 |
| `pnpm analytics:type-check` | 成功 |
| `pnpm analytics:build` | 成功 |
| `pnpm docs:check` | 成功。sandbox内のtsx IPC制限を避けて同じcommandを再実行 |

計画の制約に従い、Analytics frontend test、Convex test、Storybook、VRT、E2Eは追加、更新、実行していない。  
`localhost:3001`での最終的な読みやすさは利用者の受入確認に残し、自動検証の完了条件とは分ける。

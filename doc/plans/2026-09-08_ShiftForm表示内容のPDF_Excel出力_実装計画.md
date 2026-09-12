# ShiftForm表示内容のPDF・Excel出力 実装計画

作成日: 2026-09-08  
状態: History（実装・対象検証完了）

出力ボタンを押した時点のShiftFormの勤務内容を別タブへ渡し、プレビュー・PDF・Excelで共通利用する。  
スタッフはDashboardの並び順に揃え、「下書き」「確定済み」などの状態ラベルと通知状況をすべての出力から削除する。

## 合意した変更と範囲

| 項目 | 変更後の契約 |
|---|---|
| 勤務内容 | ShiftFormの現在値。希望から自動反映された勤務と、未保存の編集を含める |
| 取得時点 | 出力ボタン押下時。以後の編集やDB更新で出力タブを書き換えない |
| スタッフ順 | 対象店舗のDashboardと同じ順序。ShiftForm内の一時的な表示順を使わない |
| 対象スタッフ | ShiftFormが扱うスタッフ集合。Dashboard上のシフト対象外スタッフは追加しない |
| 保存・確定・通知 | 出力操作では実行しない。未保存であることを理由に出力を止めない |
| 状態表示 | 下書き、確定済み、確定後の変更、変更状況不明、通知状況をページ・PDF・Excelから削除する |
| 通常時の案内 | ページに「出力画面を開いた時点のシフトを表示しています」とだけ補足する。ファイルには入れない |
| エラー | 受け渡し失敗、権限不足、出力データ不正、ファイル生成失敗には回復方法を示す |

「現在の表示」は勤務内容を意味し、画面のスクリーンショット化は行わない。  
募集の全期間・対象スタッフ全員を出力し、選択中の週、SPで開いている日、スクロール位置には限定しない。  
この出力範囲は現行を維持する計画上の前提とする。

## 現行実装で変更が必要な理由

`buildShiftData.ts`は保存済み割当に加え、条件に応じて希望から勤務を組み立てる。  
一方、`convex/shiftExport/queries.ts`は保存済み割当だけを返すため、画面に勤務があっても出力が「-」になる。

`hasUnsavedChanges()`はフォームの初期値と現在値を比較する。  
希望が初期表示へ反映されただけの場合は差分がなく、現在の「変更を保存してから出力してください」では食い違いを防げない。

ShiftBoardのスタッフ取得はDashboardの順序indexを使用していない。  
Dashboardは保存された順序を使用し、旧形式では管理者を先にするため、ShiftBoardの配列をそのまま渡しても順序の一致は保証できない。

## 実装順序

### 1. 出力用データを現在のフォーム値から作る

`useShiftBoardPageController.ts`の`shiftsRef.current`から、押下時点の勤務データを独立した値として複製する。  
既存の`buildAssignments`による勤務抽出を確認して再利用し、初期表示用データや保存基準へ戻して作り直さない。  
店舗名、対象期間、定休日、勤務パターン名も同じ出力用データへ含める。

出力先との共有契約は、表示内容と受け渡しに必要な最小データにする。  
`draftSavedAt`、`confirmedAt`、`isConfirmed`、`confirmationState`、`contentComparison`、`notificationState`は出力モデルから除く。  
対象スタッフID、日付、時間区間、パターンIDの整合性と上限は受信時にも検証する。

未保存変更の出力ブロックを削除する。  
フォーム初期化中と保存・確定の処理中は既存の操作制御を維持し、実行中の処理と競合させない。  
通常の離脱確認、下書き保存、確定、通知の動作は維持する。

### 2. Dashboard順のスタッフIDを用意する

既存のShiftBoard取得処理へ出力用の順序情報を追加し、画面の準備中に取得しておく。  
出力クリック後にDashboard全件や連絡先を取得する経路は作らない。  
`getOrganizationStaffOrderScope`と既存の`shopStaffOrderEntries`を使い、同じ店舗の表示対象スタッフIDを順序付けする。

保存順序がある場合はDashboardと同じ`displayOrder`を使う。  
旧形式ではDashboardと同じ管理者判定と安定した元順序を使い、管理者を先にする。  
Dashboardの折りたたみ・ページ取得件数には依存せず、対象全員へ同じ順序規則を適用する。

過去募集の削除済みスタッフはDashboardに存在しないため、現スタッフの後へ作成順・ID順で付ける。  
スタッフの欠落、重複、店舗越境、上限超過がある場合は部分的な帳票を作らない。  
出力用の並べ替えでShiftForm自体の表示順や編集状態を変更しない。

### 3. 別タブへ一度だけ渡し、タブ内に保持する

受け渡しは`BroadcastChannel`、再読み込み用の保持は出力タブ自身の`sessionStorage`を第一案とする。  
同一originのタブ間通信はウィンドウ参照なしで利用でき、`sessionStorage`はタブ単位で再読み込みをまたいで保持できる。  
ブラウザの復元でも残り得るため、保持期限を別途設ける。参考: [Broadcast Channel API](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)、[sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)。

| 順序 | 処理 |
|---|---|
| 押下時 | 勤務内容と順序を複製し、暗号学的乱数の受け渡しIDを作る。送信側を待受状態にして、同じ操作内で別タブを開く |
| 別タブ起動 | 認証と対象店舗・募集の閲覧権限を確認し、受け渡しIDを使って受信準備完了を通知する |
| データ受信 | version・ID・利用者・組織・店舗・募集・型・件数を検証し、タブ内へ保持する |
| 受信完了 | 出力タブが受領を通知する。送信側はデータと通信を破棄し、以降は同期しない |
| 再読み込み | 権限確認後、同じ利用者・対象・有効期限の保存データを使う。DBの勤務内容へfallbackしない |

URLには勤務内容やスタッフ名を入れず、受け渡しIDだけをfragmentに入れる。  
受信後はfragmentを除去し、URLの共有を帳票共有機能にしない。  
現在の`noopener,noreferrer`は維持する。`noopener`では戻り値が`null`になり得るため、`window.open()`の戻り値だけでポップアップ失敗を判定せず、受信完了通知で判定する。参考: [window.open](https://developer.mozilla.org/en-US/docs/Web/API/Window/open)。

受け渡し待機は30秒、保存データの期限は取得から24時間を第一案とする。  
受信失敗時は元のシフト表から開き直す案内を出し、古いDBデータを代わりに表示しない。  
一度受け取った後は元タブを閉じても出力できるが、受信前に元タブを閉じた場合は失敗として扱う。

`sessionStorage`への書き込みに失敗しても、受信済みのデータをメモリで保持できればその場の出力は可能にする。  
その場合は再読み込みで復元できない旨を短く示す。通信APIを利用できない場合は、保存済みデータの出力へ切り替えず、出力を開始できない理由を示す。

受け渡し処理はShiftExport featureが所有し、`app-shift-board` pageが公開入口とShiftBoardのcallbackを接続する。  
勤務データの抽出はShiftBoard側、受信と保持はShiftExport側へ置く。feature間の内部ファイル参照や汎用通信基盤を新設しない。

### 4. 出力ページと生成処理を切り替える

`src/pages/shift-export/index.tsx`から勤務内容のquery購読を外し、受信・復元したデータを`ShiftExportPage`へ渡す。  
既存のbare認証routeと最小の所属・店舗・募集の確認は維持する。  
「DBと連動しない」は帳票内容の独立を指し、認証・認可の確認を省く意味ではない。

`View.tsx`、`pdf.tsx`、`excel.ts`の状態表示領域を削除し、空いた行と余白を詰める。  
PDFはA4横、期間分割と縦改ページ、Excelは編集可能な文字列セル、固定見出し、印刷設定を維持する。

時間指定は複数の勤務区間を保持し、9:00〜12:00と14:00〜18:00を9:00〜18:00へまとめない。  
区間ごとに開始・終了を表示できるよう、共通セルと行高の計算を調整する。  
これは「画面の勤務内容を出力する」ために必要な変更とする。ポジション色や編集用の警告アイコンを帳票へ再現する作業は含めない。

参照先がなくなった`getShiftExportData`と専用テストは利用箇所を確認して撤去する。  
確定内容比較や通知確認の共有実装は他の利用箇所を維持し、出力のためだけの呼び出しを除く。  
旧出力URLの直接入力は認証後に「シフト表から出力画面を開いてください」と案内する。

### 5. テストと文書を更新する

| 契約 | 主担当層 | 更新内容 |
|---|---|---|
| 画面の勤務内容を複製する | Logic / Frontend Unit | 希望の自動反映、未保存の追加・削除、全員非出勤、3入力方式、中抜け、押下後の元データ変更からの独立を検証 |
| Dashboard順と対象集合 | Convex Function | 順序設定あり・旧形式・シフト対象外・削除済み・重複・上限・他店舗を検証。順序情報を既存queryへ追加した契約を守る |
| タブの受け渡しと復元 | Frontend Unit | ready前の送信防止、受領後の破棄、連続出力の混線防止、不正payload、timeout、利用者切替、期限切れ、保存失敗を検証 |
| PDF・Excelの実ファイル | 既存Logic | 状態ラベルなし、全区間とスタッフ順の一致、文字列セル、分割・行高・改ページを既存の実ファイル読み戻しで検証 |
| 出力導線と見た目 | 既存PC/SP Behavior・VRT | 未保存でも出力可能、状態欄の削除、分割切替、Loading・失敗・開き直しの表示を更新 |
| 実タブとダウンロード | 既存E2E | `E2E-EXPORT-01`を未保存の編集から別タブへ渡すケースに変更。受領後の元タブ終了、出力タブreload、PDF・Excel保存まで確認 |
| 匿名の直接アクセス | 既存E2E | `E2E-EXPORT-02`のログイン誘導を維持。ログインだけで勤務内容を復元した扱いにしない |

旧仕様の「未保存なら出力禁止」「DBの最新内容へ更新」「確定・通知状態を表示」を固定するassertionは新契約へ置き換える。  
ブラウザ接続以外の分岐をE2Eへ重複追加しない。Agentによる手動ブラウザ操作は実施しない。

実装時に`doc/features/shift-board.md`、`doc/features/help-center.md`と出力ヘルプを更新する。  
`doc/specs/full-regression-contracts.md`の`SHIFT-EXPORT-DATA-01`、`SHIFT-EXPORT-FILE-01`、`SHIFT-EXPORT-LIFECYCLE-01`、E2E契約、public API一覧も同時に更新する。  
HelpCenter変更時は同featureのAGENTS.mdと`write-help-content`を適用する。

## Security Lens

| 観点 | 本変更で守ること |
|---|---|
| Actor / Asset | 認証済み管理者がすでに表示しているスタッフ名と勤務内容を、同じアプリの出力タブへ渡す |
| Trust boundary | タブ間メッセージとsessionStorageは未検証入力として扱う。受け渡しIDはサーバーの権限証明に使わない |
| Abuse case | 別出力との混線、別利用者への再表示、保存データ改変、URLやログへの勤務情報流出を防ぐ |
| Server-side enforcement | 元画面と出力先の既存認証・管理者・組織・店舗・募集確認を維持する。クライアントの内容をDBへ書き戻すAPIを追加しない |
| Rate limit / idempotency | DB更新・通知は0件。出力ごとの一意IDと受領通知で重複受信を防ぎ、ファイル生成の既存single-flightを維持する |
| Lifecycle / recovery | タブ内の保持は利用者と対象に紐付ける。ログアウト・利用者切替・認可喪失・期限切れで破棄し、生成中の古いBlobも公開しない。権限確認中は復元データを描画しない |
| Logs / PII | 勤務情報、氏名、受け渡しIDをURL query、解析イベント、console、テスト成果物へ残さない。localStorageやサーバーへ帳票内容を保存しない |
| Regression test | 上表のFunction・Frontend Unitで拒否と副作用なしを検証し、実タブの接続だけをE2Eで補う |

## 検証と完了条件

対象のLogic・Frontend Unit、変更したConvex Function、PC/SP Behaviorを先に実行する。  
その後に`pnpm lint`、`pnpm type-check`、`pnpm test`、`pnpm build`を実行する。  
既存ローカル環境で`pnpm e2e e2e/scenarios/shift-export.test.ts --project=desktop-chromium --retries=0 --workers=1`を実行し、サーバーは新規起動しない。

希望反映・未保存編集を含む勤務内容が全出力で一致し、Dashboard順が揃い、状態ラベルがなく、元タブ終了と出力タブreload後も同じ内容で出力できることを完了条件とする。  
保存・確定・通知の副作用が発生しないこと、受信失敗時に保存済み内容へ切り替わらないことも含む。

VRTは状態欄削除と複数区間の行高を確認する。  
CIでのVRT確認、実機保存、物理印刷、Production反映はコード検証と分けて報告する。  
計画作成後に実装を承認され、現在のcheckoutで実装した。commit・pushは別途明示された場合に行う。

## 実装・検証記録

現在値の複製、Dashboard順の受け渡し、タブ内保持、状態ラベル削除、複数の勤務区間の表示を実装した。  
SPの出力メニューで検出したcallback不発も修正し、キーボード操作と操作後のフォーカス復帰を検証した。  
受信後の権限喪失では内容と保持データを消去し、権限が戻っても古い帳票を再表示しない。

| 検証 | 結果 |
|---|---|
| 静的チェック | Biome、Convex timezone・function registration、docs checkが成功。sandboxのtsx IPC制限は同じscriptを`node --import tsx`で実行して検証 |
| 型・build | 型チェックとbuildが成功。buildのStripeテスト料金読取にはsandbox外のnetworkを使用 |
| 全Logic | 258ファイル・2,249テスト成功。最後の権限喪失時の補強後にも受け渡し11テストが成功 |
| 全Convex | Logic・Scenario合わせて180ファイル・2,201テスト成功 |
| 全UI | 1,038テスト成功、Dashboardの既存ケース1件失敗。対象の出力UIは成功 |
| 対象Convex・UI | Convex 3ファイル38テスト、PC/SP・出力UI 3ファイル39テスト成功 |
| E2E | `E2E-EXPORT-01/02`の2テスト成功。未保存編集、元タブ終了、PDF保存、reload、Excel保存、匿名ログイン誘導を確認 |

全体Convex検証の初回はローカルの通知デバッグ設定がテストへ入り失敗した。  
実環境を変更せず、テストプロセスだけ`DEBUG_MODE=false`、`DEBUG_NOTIFICATION_DELIVERY_MODE=''`にして全件成功を確認した。

全体UIの失敗は`DashboardContent/OperationalTodoConfirmationFocusBehavior`で、スタッフ登録申請の却下確認が開かないものだった。  
変更前のHEADを一時コピーし、同じ依存関係で同じ1ケースの失敗を再現した。今回の出力変更とは独立した既存不具合として、ActionInboxの修正は変更範囲へ追加していない。  
検証の一時コピーには`.env`を複製せず、公開ローカルURLと共有依存関係の読取範囲だけを指定した。

CIのVRT、実機保存、物理印刷、Productionへの反映、commit・pushは実施していない。

## 参照ファイル

| 用途 | パス |
|---|---|
| 現行仕様 | `doc/features/shift-board.md`、`doc/features/help-center.md` |
| 画面の現在値 | `src/components/features/ShiftBoard/ShiftBoardPage/useShiftBoardPageController.ts`、`buildShiftData.ts` |
| 表示と勤務抽出 | `src/domains/shift/resolveDisplayShiftLine.ts`、`src/domains/shift/buildAssignments.ts` |
| Dashboard順 | `src/components/features/Dashboard/StaffManagement/index.tsx`、`convex/dashboard/queries.ts`、`convex/organization/staffOrder.ts` |
| 元画面の取得・接続 | `convex/shiftBoard/queries.ts`、`src/pages/app-shift-board/index.tsx` |
| 現行出力の取得・接続 | `convex/shiftExport/queries.ts`、`src/pages/shift-export/index.tsx`、`src/routes/_auth/shifts_.$recruitmentId_.export.tsx` |
| 出力モデル・生成 | `src/components/features/ShiftExport/types.ts`、`script.ts`、`View.tsx`、`pdf.tsx`、`excel.ts`、`layout.ts`、`useExportDownload.ts` |
| 検証契約 | `doc/rules/testing-strategy.md`、`doc/specs/full-regression-contracts.md`、`e2e/scenarios/shift-export.test.ts` |
| 設計規約 | `doc/rules/frontend-architecture.md`、`doc/rules/ui-design.md`、`doc/rules/security-strategy.md` |

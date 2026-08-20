# スタッフの並び順

## 目的

組織の管理ユーザーが、スタッフ一覧でよく使う順に人物を並べ替え、その順序を組織内の店舗で共有できるようにする。  並び替えはスタッフ一覧とは分けた専用画面で行い、保存するまでは表示中の一覧だけを変更する。

この並び順はスタッフ管理画面、Dashboardのスタッフ一覧、店舗詳細の所属スタッフ一覧に適用する。  シフト表と希望シフト入力は、勤務開始時刻を基準にする既存の表示順を維持し、任意順の影響を受けない。

## 画面と操作

`/staff?org=<organizationId>`の「並び順を変更」から`/staff/order?org=<organizationId>`を開く。  店舗filterから入った場合も、並び替える対象はその店舗だけではなく組織の全人物であることを画面上で説明する。

専用画面では次の操作を提供する。

- ドラッグ操作、キーボード操作、各行のメニューから並び順を変更できる。
- 行には氏名、メールアドレス、所属店舗を表示し、同名の人物を区別できるようにする。
- 変更は「並び順を保存」で一括保存する。差分がない場合は保存できない。
- 未保存のまま戻る、別URLへ移動する、ブラウザを閉じる操作では、破棄確認を表示する。
- 保存中の二重送信を防ぎ、失敗した場合は編集中の順序を保持して再試行できるようにする。
- 編集中にスタッフ情報や並び順が更新された場合は、編集中の順序を保持したまま競合を表示して保存を止める。「最新の内容を読み込む」を明示的に選ぶと、編集中の順序を破棄して最新状態へ切り替える。

旧URLの`/app/staff/order`は、`org`と`shopFilter`を維持して正規URLへ置換遷移する。

## 並び順の単位とライフサイクル

並び順は店舗ごとではなく、`organizationPeople`を対象とした組織共通の1列である。  店舗別一覧は、その組織共通順から対象店舗に所属する人物だけを取り出した部分列として表示する。

| 状態変化 | 並び順の結果 |
|---|---|
| 初めて保存する | 現在の全人物を画面上の順序で保存し、以後の一覧に適用する |
| 新しい人物を追加する | 組織共通順の末尾へ追加する |
| 削除済み人物を再追加する | 以前の位置を復元せず、組織共通順の末尾へ追加する |
| 既存人物を別店舗へ追加する | 人物の組織共通順位をそのまま使い、店舗別一覧の対応位置へ表示する |
| 店舗所属だけを解除する | 組織共通順位を維持し、解除した店舗の一覧からだけ除外する |
| 人物を組織から削除する | 組織共通順と全店舗の並び順対象から除外する |
| 店舗をアーカイブまたは契約制限で停止する | その店舗では保存済み順を使用せず、既存の一覧順へ戻す |
| 店舗を再稼働する | 現在の組織共通順を使って店舗別の順序を再構築する |
| 組織を削除する | 並び順の有効状態を即時に終了し、関連データを削除cleanupの対象にする |

## 保存と読み取り

保存APIは、認証中の組織管理ユーザーをサーバー側で確認し、通常の事業操作が可能な課金状態でだけ更新を受け付ける。  clientから渡された人物IDは、対象組織の有効人物集合と完全一致し、重複がなく、画面を開いた後に一覧が変わっていない場合だけ保存する。

既存のページングを維持するため、並び順は新しい空のorder tableへ保存する。  既存tableに新しいindexを追加せず、初回保存前の組織には保存用documentを作らない。並び順が未設定、対象集合が上限を超えた、または既知の整合性不成立を検出した場合はorder stateを無効化し、部分的な並び順を返さず既存indexによる一覧へ安全に戻す。予期しないDB errorまで握りつぶさず、同じtransactionのsource更新とともに失敗させる。

Dashboardは店舗用のorder projectionをページングし、スタッフ管理の全店舗表示は組織人物用のorder projectionをページングする。  店舗filterと店舗詳細の所属スタッフ一覧では、同じ組織共通順位から対象店舗の部分列を返す。削除済み人物、削除済みstaff、非active店舗、別組織のIDをorder dataから表示へ混入させない。

## 認可と安全性

- 読み取りと保存は、URLや引数の組織IDだけを信用せず、認証中ユーザーのcanonicalな組織所属を確認する。
- 保存は人物ID集合の完全一致とrevisionを再検証し、追加・削除と競合した古い画面からの上書きを拒否する。
- 人物数、active店舗数、店舗スタッフ数の既存上限内だけで同期する。上限超過や不整合ではorder stateを無効化し、既存順へ戻す。
- 氏名、メールアドレスなどの個人情報を並び順の監査値やログへ複製しない。
- ShiftForm、ShiftBoard、シフト割当DTOへorder値を渡さず、勤務開始時刻順との境界を維持する。

## 関連ファイル

### バックエンド

- `convex/schema.ts`：並び順の有効状態、組織人物順、店舗スタッフ順のtableとindex。
- `convex/organization/staffOrder.ts`：初回保存、revision検証、sourceとの同期、整合性不成立時の既存順fallback。
- `convex/appOrganization/queries.ts`：スタッフ管理の全店舗表示と店舗filterのorder-aware pagination。
- `convex/dashboard/queries.ts`：Dashboard店舗スタッフ一覧のorder-aware pagination。
- `convex/organization/queries.ts`：組織設定と店舗詳細が共有する人物一覧へ、整合する組織共通順を反映する。
- `convex/staff/`、`convex/staffRegistration/`、`convex/organization/`：人物・店舗所属・店舗状態の変更後にorder projectionを同期する書き込み経路。
- `convex/deletionCleanup/`：店舗・組織削除時にorder dataを無効化し、関連documentをbounded cleanupする経路。

### フロントエンド

- `src/routes/_auth/staff_.order.tsx`：正規URLと組織scopeを扱うroute境界。
- `src/routes/_auth/app_.staff_.order.tsx`：旧URLから正規URLへの互換redirect。
- `src/pages/app-staff-order/`：route query、初回loading・error、feature構成を所有するページ境界。
- `src/components/features/StaffOrderEditor/`：編集中順序、競合検知、保存、未保存離脱と、ドラッグ・キーボード・行メニューを所有するfeature。
- `src/components/features/OrganizationSettings/PeopleSection.tsx`：スタッフ一覧から並び替え画面への入口。
- `src/components/features/Dashboard/StaffRoster/`：APIが返す店舗スタッフ順をそのまま表示する一覧。
- `src/components/features/ShopDetail/script.ts`：APIが返す組織共通順を保ったまま、対象店舗の所属スタッフだけを取り出す。

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.appOrganization.queries.listOrganizationPeople` | `organizationQuery` | order stateが有効で整合する場合は組織共通順または店舗部分列で人物をページングし、それ以外は既存順を返す |
| `api.dashboard.queries.getDashboardStaffs` | `managerQuery` | active店舗のorder projectionが整合する場合は保存済み順でstaffをページングし、それ以外は既存順を返す |
| `api.organization.queries.getSettings` | `managerQuery` | order stateと組織人物順が整合する場合は組織共通順で人物を返し、店舗詳細はその入力順を保った部分列を表示する。不整合時は既存の管理者権限・氏名順へ戻す |
| `api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor` | `organizationQuery` | 並び替え画面用に、組織の全active人物、所属店舗、保存可否、order fingerprintをboundedに返す |
| `api.appOrganization.staffOrderQueries.getOrganizationStaffOrderScope` | `organizationQuery` | 全店舗または同一組織店舗filterについて、完全性を確認できたordered paginationと既存順fallbackのどちらを使うか返す |
| `api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder` | `organizationMutation` | actor、課金状態、人物集合、order fingerprintを再検証し、組織共通順とactive店舗用projectionを一transactionで保存する |

## テスト契約

| 契約 | 主担当層 | 参照先 |
|---|---|---|
| 初回保存、保存順のページング、店舗部分列、Dashboard・組織設定・店舗詳細への反映、stale fingerprint、別組織ID、重複・欠落ID、readOnly・契約制限を検証する | Convex Function Test | `convex/appOrganization/staffOrder.test.ts`、`convex/appOrganization/queries.test.ts`、`convex/dashboard/queries.test.ts`、`convex/organization/queries.test.ts` |
| 新規・再追加を末尾へ置き、店舗所属変更、人物削除、店舗停止・再稼働、組織削除でも安全に同期または既存順へ戻す | Convex Function / Scenario Test | `convex/staff/mutations.test.ts`、`convex/staffRegistration/mutations.test.ts`、`convex/organization/mutations.test.ts`、`convex/deletionCleanup/mutations.test.ts`、`convex/_scenario/staffOrderLifecycle.test.ts` |
| ドラッグ、キーボード、行メニュー、保存、失敗時保持、未保存離脱確認を検証する | Frontend Unit / Storybook Behavior Test | `src/components/features/StaffOrderEditor/`、`src/pages/app-staff-order/` |
| PCと320px幅で行、操作handle、複数行文言、保存操作が欠けないことを検証する | Storybook VRT | `src/components/features/StaffOrderEditor/index.stories.tsx` |

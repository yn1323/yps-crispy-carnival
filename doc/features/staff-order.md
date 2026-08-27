# スタッフの並び順

## 目的

組織の管理ユーザーが、スタッフページで一覧を見ながら人物を並べ替え、その順序を組織内の店舗で共有できるようにする。
並び替えは店舗filterが「すべて」のときだけ提供し、専用画面と明示的な保存操作は設けない。

この並び順はスタッフ管理画面、Dashboardのスタッフ一覧、店舗詳細の所属スタッフ一覧に適用する。
シフト表と希望シフト入力は、勤務開始時刻を基準にする既存の表示順を維持し、任意順の影響を受けない。

## 画面と操作

`/staff?org=<organizationId>`で店舗filterが「すべて」のとき、各スタッフ行の左側にドラッグハンドルを表示する。
ドラッグまたはキーボード操作で行を移動し、ドロップした時点で組織共通の並び順を保存する。

店舗filterで個別店舗を選んだときはドラッグハンドルを表示せず、並べ替えを提供しない。
店舗別一覧は組織共通順の部分列であり、一部の人物だけを並べ替える操作にはしない。

ドロップ直後は画面上の順序を先に変更するoptimistic updateを行い、保存中は別の並べ替えを受け付けない。
保存に成功した場合は通知を表示しない。
保存に失敗した場合はドロップ前の順序へ戻し、タイトルだけのエラーToast「並び順を保存できませんでした」を表示する。

旧URLの`/staff/order`と`/app/staff/order`は、`org`だけを維持して`/staff`へ置換遷移する。
`shopFilter`は引き継がず、店舗filterが「すべて」のスタッフページへ戻す。

## 並び順の単位とライフサイクル

並び順は店舗ごとではなく、`organizationPeople`を対象とした組織共通の1列である。
店舗別一覧は、その組織共通順から対象店舗に所属する人物だけを取り出した部分列として表示する。

| 状態変化 | 並び順の結果 |
|---|---|
| 初めて保存する | 現在の全人物を画面上の順序で保存し、以後の一覧に適用する |
| 新しい人物を追加する | 組織共通順の末尾へ追加する |
| 削除済み人物を再追加する | 以前の位置を復元せず、組織共通順の末尾へ追加する |
| 既存人物を別店舗へ追加する | 人物の組織共通順位をそのまま使い、店舗別一覧の対応位置へ表示する |
| 店舗所属だけを解除する | 組織共通順位を維持し、解除した店舗の一覧からだけ除外する |
| 人物を組織から削除する | 組織共通順と全店舗の並び順対象から除外する |
| 店舗をアーカイブする | その店舗では保存済み順を使用せず、既存の一覧順へ戻す |
| 店舗を再稼働する | 現在の組織共通順を使って店舗別の順序を再構築する |
| 組織を削除する | 並び順の有効状態を即時に終了し、関連データを削除cleanupの対象にする |

## 保存と読み取り

保存APIは、認証中の組織管理ユーザーをサーバー側で確認し、通常の事業操作が可能な課金状態でだけ更新を受け付ける。
clientから渡された人物IDは、対象組織の有効人物集合と完全一致し、重複がなく、一覧を取得した後に人物集合や並び順が変わっていない場合だけ保存する。
`/staff`は店舗filterが「すべて」のときに保存対象となる全人物とorder fingerprintを取得し、ドロップ後に全人物IDを保存APIへ渡す。

既存のページングを維持するため、並び順は専用のorder tableへ保存する。
既存tableに新しいindexを追加せず、初回保存前の組織には保存用documentを作らない。
並び順が未設定、対象集合が上限を超えた、または既知の整合性不成立を検出した場合はorder stateを無効化し、部分的な並び順を返さず既存indexによる一覧へ安全に戻す。
予期しないDB errorまで握りつぶさず、同じtransactionのsource更新とともに失敗させる。

スタッフ管理の「すべて」は、boundedに取得した全人物をeditor snapshotの人物ID順へclientで整列し、保存後も同じ一覧を維持する。
Dashboardは店舗用のorder projectionをページングし、店舗filterと店舗詳細の所属スタッフ一覧では、同じ組織共通順位から対象店舗の部分列を返す。
削除済み人物、削除済みstaff、非active店舗、別組織のIDをorder dataから表示へ混入させない。

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
- `convex/appOrganization/queries.ts`：スタッフ管理の人物一覧と、店舗filterのorder-aware pagination。
- `convex/dashboard/queries.ts`：Dashboard店舗スタッフ一覧のorder-aware pagination。
- `convex/organization/queries.ts`：組織設定と店舗詳細が共有する人物一覧へ、整合する組織共通順を反映する。
- `convex/staff/`、`convex/staffRegistration/`、`convex/organization/`：人物・店舗所属・店舗状態の変更後にorder projectionを同期する書き込み経路。
- `convex/deletionCleanup/`：店舗・組織削除時にorder dataを無効化し、関連documentをbounded cleanupする経路。

### フロントエンド

- `src/routes/_auth/staff_.order.tsx`、`src/routes/_auth/app_.staff_.order.tsx`：旧URLから店舗filterが「すべて」のスタッフページへ戻す互換redirect。
- `src/pages/app-staff/`：店舗filterに応じた並び替え用queryとスタッフ一覧の構成を所有するページ境界。
- `src/components/features/OrganizationSettings/PeopleSection.tsx`：スタッフ行のドラッグハンドルと並び替え操作を表示する一覧。
- `src/components/features/OrganizationSettings/staffOrder.ts`、`useStaffOrderReorder.ts`：並び替え、optimistic update、保存、失敗時のrollbackを所有する。
- `src/components/features/Dashboard/StaffRoster/`：APIが返す店舗スタッフ順をそのまま表示する一覧。
- `src/components/features/ShopDetail/script.ts`：APIが返す組織共通順を保ったまま、対象店舗の所属スタッフだけを取り出す。

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.appOrganization.queries.listOrganizationPeople` | `organizationQuery` | order stateが有効で整合する場合は組織共通順または店舗部分列で人物をページングし、それ以外は既存順を返す |
| `api.dashboard.queries.getDashboardStaffs` | `managerQuery` | active店舗のorder projectionが整合する場合は保存済み順でstaffをページングし、それ以外は既存順を返す |
| `api.organization.queries.getSettings` | `managerQuery` | order stateと組織人物順が整合する場合は組織共通順で人物を返し、店舗詳細はその入力順を保った部分列を表示する。不整合時は既存の管理者権限・氏名順へ戻す |
| `api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor` | `organizationQuery` | 「すべて」のスタッフ一覧で並び替える全active人物、保存可否、order fingerprintをboundedに返す |
| `api.appOrganization.staffOrderQueries.getOrganizationStaffOrderScope` | `organizationQuery` | 全店舗または同一組織店舗filterについて、完全性を確認できたordered paginationと既存順fallbackのどちらを使うか返す |
| `api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder` | `organizationMutation` | actor、課金状態、人物集合、order fingerprintを再検証し、組織共通順とactive店舗用projectionを一transactionで保存する |

## テスト契約

| 契約 | 主担当層 | 参照先 |
|---|---|---|
| 初回保存、保存順のページング、店舗部分列、Dashboard・組織設定・店舗詳細への反映、stale fingerprint、別組織ID、重複・欠落ID、`removed`所属・契約制限を検証する | Convex Function Test | `convex/appOrganization/staffOrder.test.ts`、`convex/appOrganization/queries.test.ts`、`convex/dashboard/queries.test.ts`、`convex/organization/queries.test.ts` |
| 新規・再追加を末尾へ置き、店舗所属変更、人物削除、店舗停止・再稼働、組織削除でも安全に同期または既存順へ戻す | Convex Function / Scenario Test | `convex/staff/mutations.test.ts`、`convex/staffRegistration/mutations.test.ts`、`convex/organization/mutations.test.ts`、`convex/deletionCleanup/mutations.test.ts`、`convex/_scenario/staffOrderLifecycle.test.ts` |
| 全人物IDの並び替え、optimistic update、保存成功、失敗時rollbackとタイトルだけのToastを検証する | Logic / Frontend Unit Test | `src/components/features/OrganizationSettings/staffOrder.test.ts`、`src/components/features/OrganizationSettings/useStaffOrderReorder.test.tsx` |
| 「すべて」では行の左側にhandleを表示し、個別店舗ではhandleを表示しないことと、ドラッグ・キーボード操作を検証する | Frontend Unit / Storybook Behavior Test | `src/pages/app-staff/index.test.tsx`、`src/pages/app-staff/index.stories.tsx` |
| PCとモバイルでhandleを含む行のレイアウトが崩れないことを検証する | Storybook VRT | `src/pages/app-staff/index.stories.tsx` |

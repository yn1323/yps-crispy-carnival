# AGENTS.md

このファイルは、`src/` 配下を編集するエージェント向けの入口です。

フロントエンドのディレクトリ、依存方向、ファイル責務は `doc/rules/frontend-architecture.md` を Source of Truth とします。
作業開始時に同ドキュメントを読み、ルートの `AGENTS.md`、`doc/rules/testing-strategy.md` と併用してください。

`apps/analytics-dashboard/` は独立した内部BIなので、このファイルではなく `apps/analytics-dashboard/AGENTS.md` を優先します。

## レイヤーの要約

```text
routes/       URL、head、search/params、route group
pages/        route全体のquery、metadata、画面状態分岐
components/
  features/   ユースケース、feature-local query、mutation/action、操作状態
  shared/     複数featureで使う業務UI
  templates/  ページとアプリのレイアウト
  ui/         ドメイン非依存のUI基盤
domains/      画面非依存の業務型と純粋ロジック
providers/    React ProviderとSDK初期化
hooks/        横断的なReact hook
stores/       アプリ横断のclient state
lib/          業務知識を持たない技術的な共通処理
configs/      JSXを持たない設定
constants/    真にアプリ横断の定数
assets/       複数featureで共有するimport asset
devtools/     本番から参照しない開発用UI
```

## 必須ルール

- routeにはURL境界だけを書き、`__root.tsx`、route group、redirect-only routeを除くleaf routeからpageを呼び出す。
- routeの `head` 用metadataは対応pageの `meta.ts` で組み立てる。
- pageはroute全体を成立させるqueryとloading、error、null、empty、normalの分岐を担当する。
- pageに `useMutation`、`useAction`、Toast、Dialog、submit後の状態遷移を書かない。
- feature containerまたはcontrollerは、feature-local query、mutation/action、single-flight、画面状態、ユーザー操作の順序を担当する。
- 下位Viewには判断済みのViewModelとintent callbackを渡し、raw DTOから業務可否を再計算させない。
- 画面を変えても意味が変わらない業務ルールは `domains/` に置く。
- 一つのfeatureだけで使うテスト対象または複雑な純粋処理は `script.ts` に置き、小さな表示固有の導出はViewに残してよい。
- domainはReact、Convex、Chakra、Jotai、Router、DOM、localStorage、画面固有文言、component Propsへ依存しない。
- uiはConvex、feature、業務store、domain固有文言へ依存しない。
- leaf feature同士はimportしない。明示的なcomposition featureだけがtop-level再利用leaf featureの公開entryをimportしてよい。
- 認可、店舗境界、token有効性、課金権限はフロントエンドで保証せず、Convex側の検証を正とする。

## ファイル名

- UIディレクトリの公開componentは `index.tsx` に置く。
- `index.tsx` と対になる非UIコードは `script.ts` に置く。
- 同じディレクトリに実装を持つ `index.ts` と `index.tsx` を共存させない。
- `index.ts` はUIを持たないディレクトリの公開entryに限り、`index.tsx` の非UI companionには使わない。
- `script.ts` にJSX、React hook、DOM、Toast、router、query、mutation、actionを書かない。
- `script.ts` の変換関数はplain dataだけを扱い、Chakra UI、Jotai、browser storageにも依存させない。
- 意味名を持つ `schema.ts`、`adapter.ts`、`stores.ts`、`presentation.ts`、`buildSubmissionInput.ts` などは `script.ts` と別に作ってよい。
- `types.ts` には型だけを書き、関数、ソート、日付判定、ラベル生成を書かない。
- component Propsは原則として利用componentと同じファイルに置く。
- 純粋処理のtestは対象と同じbasenameにし、`script.ts` なら `script.test.ts` とする。

## シフト関連

- シフトの業務型は `src/domains/shift/` を正規の置き場とする。
- 日付操作は `src/domains/shift/date.ts`、時刻変換は `src/domains/shift/time.ts` を優先する。
- シフト操作は `src/domains/shift/operations.ts`、スタッフソートは `src/domains/shift/sortStaffs.ts` を確認する。
- UI座標変換、drag、hit testing、responsive分岐、Chakraの色tokenはShiftForm feature側に置く。
- `new Date().toISOString()` で業務日付の `YYYY-MM-DD` を作らない。

## フォーム

- React Hook FormとZodを使う。
- mutationと共有するZod schemaは `convex/{useCase}/schemas.ts` を正とする。
- frontendではresolver接続とUI固有refinementだけを追加する。
- Submit系はUIのloading/disabledだけに頼らず、同期ガードと必要なbackend冪等性を設計する。

## import

- パスエイリアスは `@/src/...` と `@/convex/...` を使う。
- 同一feature内の近いファイルは相対importでもよい。
- domain、shared UI、ui、Convexはalias importを優先する。
- `src/routeTree.gen.ts` は生成物なので手動編集しない。

## テストと確認

- テスト層と粒度は `doc/rules/testing-strategy.md` と `test-strategy` に従う。
- UIを追加または変更するときは、同階層のStoryを作成または更新する。
- domainまたは `script.ts` の純粋ロジックを変更したら、対応するLogic UTを更新する。
- `src/` の変更後は最低限 `pnpm lint` と `pnpm type-check` を実行する。
- domainロジックを触ったら `pnpm test:logic` を実行する。

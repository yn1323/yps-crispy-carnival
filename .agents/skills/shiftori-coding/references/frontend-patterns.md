# Frontend Patterns

配置、依存方向、ファイル責務の詳細は `doc/rules/frontend-architecture.md` を Source of Truth とする。
このファイルはReact、TanStack Router、Chakra UI、フォーム、Storybookの実装パターンを補足する。

## レイヤー境界

| 層 | 書くこと | 書かないこと |
|---|---|---|
| `src/routes/` | `createFileRoute`、`head`、`validateSearch`、params/search、route group、page 呼び出し | query、mutation、業務上のJSX分岐 |
| `src/pages/` | route全体を成立させるquery、metadata、loading/error/null/normal の振り分け | `useMutation` / `useAction`、feature-localなpagination、ViewModel生成 |
| `src/components/features/` | ユースケースUI、feature-local query、操作イベント、mutation/action hook、UI固有計算 | 画面を超えて同じ意味を持つ純粋な業務ロジック |
| `src/components/shared/` | 複数featureで使う業務UI | query、mutation、特定featureの状態機械 |
| `src/components/templates/` | ページとアプリのレイアウト | 業務query、mutation、操作可否判定 |
| `src/components/ui/` | ドメイン知識を持たない Chakra UI v3 ラッパー | feature 固有文言、Convex API 依存 |
| `src/domains/` | 型、定数、日付/時刻変換、ソート、計算、画面横断で安定した業務値の表記 | React、Convex、Chakra、Jotai、画面固有文言・色 |

## ファイル配置

- UIあり feature は同階層に `index.tsx` と `index.stories.tsx` を置く。
- `index.tsx` と対になるfeature-localな非UIコードは `script.ts`、テストは `script.test.ts` に置く。
- 同じディレクトリに実装を持つ `index.ts` と `index.tsx` を共存させない。
- `script.ts` にJSX、React hook、DOM、Toast、router、query、mutation、actionを書かない。
- `script.ts` の変換関数はplain dataだけを扱い、Chakra UI、Jotai、browser storageへ依存させない。
- 一度しか使わない短い表示導出はViewへ残してよい。責務へ名前を付けられる場合は `adapter.ts` や `buildSubmissionInput.ts` を優先する。
- feature外からはrootの公開entryだけをimportし、`script.ts` や子componentをdeep importしない。宣言済みの静的content metadata entryだけは例外とする。
- 画面を変えても同じ意味を持つ業務ロジックはdomain配下へ置く。
- 同じ feature 内の近いファイルは相対 import でよい。shared UI、domain、convex は `@/src/...` / `@/convex/...` を優先する。
- route からpage componentと同じpageディレクトリの `meta.ts` だけを呼ぶ。例: `src/routes/_auth/dashboard.tsx` は `DashboardPage` と `src/pages/dashboard/meta.ts` だけを参照する。

## データ取得と操作

- page でroute全体を成立させる `useQuery` / `usePaginatedQuery` を使い、`undefined` loading、`null` 未登録/未存在、正常系を切り分ける。
- 特定のDialog、tab、一覧だけで必要なlazy queryやpaginationは、feature containerで扱う。
- 条件が揃うまで Convex hook には `"skip"` を渡す。
- mutation/action は feature 側で `useMutation` / `useAction` を定義する。
- 店舗スコープ mutation は `useShopMutation` を検討する。`selectedShopAtom` の shopId を注入するため。
- Submit 系は `useSingleFlight` で短時間連打を止める。必要なら backend も重複検知・冪等性を持つ。

## フォーム

- React Hook Form + `zodResolver` を使う。
- mutation と共有する schema は `convex/{useCase}/schemas.ts` に置く。
- feature 固有の小さな schema wrapper や UI 用 refinement は同階層の `script.ts` に置く。
- 複数fileまたは複数formで共有するまとまったschemaだけ `schema.ts` に分ける。
- Submit ボタンは原則 enabled のままにし、押下後に validation error を出す。
- Dialog / StepperDialog 内の Select は `usePortal={false}` を指定する。

## 日付と時刻

- フロントの業務日付は `YYYY-MM-DD` 文字列を正とする。
- シフト系の日付は `src/domains/shift/date.ts`、時刻は `src/domains/shift/time.ts` を優先する。
- `new Date().toISOString()` で `YYYY-MM-DD` を作らない。TZずれを避ける。
- 表示用日時は既存の `formatDateWithWeekday`、`formatDateTime` などに寄せる。

## UI

- まず `src/components/ui/` の `Button`、`Dialog`、`StepperDialog`、`Select`、`Empty`、`ShiftoriLoading`、`toaster`、`tooltip` を確認する。
- Chakra UI v3 の recipe / token / semantic token を使い、局所的な色・余白のばら撒きを避ける。
- アイコンは既存に合わせて `react-icons/lu` の Lucide 系を優先する。
- 薄い wrapper を増やす前に、その名前が業務意味、状態分岐、レイアウト責務を持つか確認する。
- Dashboard の主導線は `今やること`。通知失敗、スタッフ申請、調整が必要なシフトは独立ページより Dashboard の作業導線に寄せる。

## Storybook

- `@storybook/react-vite` から `Meta` / `StoryObj` を import する。
- Storybook play の `expect` は `storybook/test` から import する。`vitest` から直接 import しない。
- `@storybook/test` は使わない。callback mock は `() => {}` でよい。
- 代表状態、空、エラー、長文、SP/PC差分を Story に置く。
- 操作が重要なら play function を追加し、`expect(...)` と `findBy...` を使う。
- `waitFor` は消滅や transition など `findBy...` で表現しにくい場合に限る。
- 振る舞いだけを見たい Story は `parameters: { screenshot: { skip: true } }` を付ける。見た目も守るなら VRT 対象として残す。
- `position: fixed` の Header を含む full-page VRT は `parameters.vrt.releaseFixedHeader = true` を付ける。

## ArticleSite

`src/components/features/ArticleSite/` を触る時は `src/components/features/ArticleSite/AGENTS.md` を読む。
Markdown frontmatter と本文記法が SSOT で、公開記事 Markdown だけの変更なら個別記事専用 Story / test は不要。
サイトマップに影響するなら `public/sitemap.xml` も確認する。

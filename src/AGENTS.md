# AGENTS.md

このファイルは `src/` 配下を編集するエージェント向けの実装ルールです。ルートの `AGENTS.md` を前提にしつつ、フロントエンド層の責務分離はこのファイルを優先してください。

## 基本方針

`src/` は「ルーティング」「ページ状態」「機能UI」「ドメインロジック」を分けて管理します。迷った場合は、Convex API や画面状態に近いほど上位層、React や Convex に依存しないほど `domains/` に寄せます。

```
routes/       → URL定義、head、search/params の受け渡しのみ
pages/        → useQuery、ローディング/エラー/正常系の振り分け
components/
  features/   → 機能UI、useMutation/useAction、ユーザー操作イベント
  templates/  → レイアウト
  ui/         → 汎用UI部品
domains/      → 型、定数、純粋関数、表示変換
stores/       → アプリ横断の Jotai 状態
hooks/        → 複数機能で共有する React hook
helpers/      → 汎用ヘルパー
configs/      → 設定
constants/    → アプリ横断の定数
```

## レイヤールール

### `routes/`

- TanStack Router の `createFileRoute`、`head`、`validateSearch`、URL params/search の受け渡しだけを書く。
- `useQuery`、`useMutation`、`useAction`、`usePaginatedQuery` は書かない。
- ローディング、エラー、正常系の JSX 分岐を書かない。
- ページ本体は `src/pages/{page}/index.tsx` に置き、route から呼び出す。

### `pages/`

- Convex の読み取りはここで行う。`useQuery` と `usePaginatedQuery` は許可する。
- API 結果に応じた `loading` / `null` / `error` / 正常系の振り分けを担当する。
- `useMutation` と `useAction` は定義しない。書き込みや action は `components/features/**/use*.ts` に hook として置く。
- 正常系の UI 組み立ては feature コンポーネントへ渡す。ページ内に大きな機能 UI を増やさない。

### `components/features/`

- 機能単位の UI、操作イベント、`useMutation` / `useAction` hook を置く。
- feature をまたいで使う型、日付/時刻変換、ソート、シフト操作などの純粋ロジックは `domains/` に出す。
- UI 固有の座標計算、ドラッグ判定、DOM 前提の計算は feature 側に残してよい。
- UI を追加・変更するときは、同階層の `index.stories.tsx` を作成または更新する。

### `components/ui/`

- ドメイン知識を持たない再利用 UI だけを置く。
- Chakra UI v3 のラッパーやアプリ共通の見た目をここに集約する。
- feature 固有の文言や Convex API 依存を入れない。

### `domains/`

- React、Convex、Chakra、Jotai に依存しないコードだけを置く。
- 型、定数、日付/時刻変換、ソート、計算、正規化などを置く。
- ロジックを追加・変更したら、同じ domain 配下に `*.test.ts` を置く。
- `src/domains/shift/` がシフト関連の正規の置き場。日付操作は `src/domains/shift/date.ts`、時刻変換は `src/domains/shift/time.ts` を使う。

## シフト関連のルール

- `ShiftForm` の型は `src/domains/shift/types.ts` から import する。
- シフト操作は `src/domains/shift/operations.ts` に置く。
- スタッフ並び替えは `src/domains/shift/sortStaffs.ts` に置く。
- UI 座標変換は `src/components/features/Shift/ShiftForm/utils/timelineGeometry.ts` に置く。
- ドラッグの hit testing は `src/components/features/Shift/ShiftForm/utils/hitTesting.ts` に置く。
- `new Date().toISOString()` で日付文字列を作らない。TZ ずれを避けるため、フロントの日付文字列は dayjs で `YYYY-MM-DD` に整形する。

## フォーム

- React Hook Form + Zod を使う。
- mutation と共有する Zod schema は `convex/{useCase}/schemas.ts` に置き、`src/` から import する。
- UI 専用の refinement やフォーム固有のラッパーは feature 側に置いてよい。
- Submit ボタンは原則 enabled のままにし、送信時に validation error を表示する。

## import

- パスエイリアスは `@/src/...` と `@/convex/...` を使う。
- 同一 feature 内の近いファイルは相対 import でもよいが、domain や shared UI は alias import を優先する。
- `src/routeTree.gen.ts` は生成物なので手動編集しない。

## テストと確認

- UI なしのロジックを追加・変更したら `*.test.ts` を追加または更新する。
- `src/` の変更後は最低限 `pnpm lint` と `pnpm type-check` を実行する。
- domain ロジックを触ったら `pnpm test:logic` を実行する。
- 画面遷移や結合が変わる変更では `pnpm e2e` も実行する。


# AGENTS.md

このディレクトリは、Shiftoriの分析KPIを可視化する本人用の内部BIアプリです。
本体アプリの顧客向け導線とは分離し、Cloudflare Workers + Static Assets の別Worker / 別サブドメインで運用します。

主な目的は、日次蓄積されたproductionデータをサービス全体、通知、LINE、募集・提出、店舗別の角度から確認し、施策判断とデバッグを速くすることです。
develop / previewはデバッグ目的で使い、画面内の環境切替ではなく、デプロイ環境やローカルenvが接続しているConvexを見ます。

実装では、Vite + React + Chakra UI v3 + TanStack Query + @chakra-ui/charts / Rechartsを基本にします。
本体アプリと同じpage / feature / domain分離の考え方は使いますが、UI部品、router、状態管理を早期に共有しません。
共通化は、重複コストが明確になってから検討します。

ブラウザからConvex public queryを直接呼ばないでください。
データ取得は Cloudflare Worker -> Convex HTTP action -> internal query のBFF経路に限定します。
ブラウザbundleへConvex secret、Basic password、HTTP action secretを入れてはいけません。

ローカル開発では、Vite dev proxyがworkspace rootの `.env` / `.env.local` を読みます。
production接続でローカル起動したい場合は、`pnpm analytics:dev:production` を使ってworkspace rootの `.env.production` を読みます。
接続先Convexは `VITE_CONVEX_SITE_URL` を使い、未設定なら `VITE_CONVEX_URL` の `.convex.cloud` を `.convex.site` に変換して使います。
Cloudflare Worker / Vite dev proxy / Convex HTTP action の共有secretは `SHIFTORI_INTERNAL_API_SECRET` に統一します。
これはVite dev server側だけの処理であり、secretをbrowser bundleへ渡してはいけません。

Cloudflare Workers + Static Assets では `functions/` ディレクトリは使いません。
本番BFFは `src/worker.ts` と `src/server/analyticsProxy.ts` に実装し、`wrangler.jsonc` の `run_worker_first` で `/api/*` をWorkerへ先に通します。

画面やログに、staff email、manager email、token、raw notification payload、provider error bodyを出さないでください。
返却DTOは画面に必要な集計値と店舗単位の情報に限定します。

このアプリは本人だけが使う内部BIのため、自動テストとFull Regressionの対象外です。
Logic UT、UI Test、Storybook、VRT、E2Eを新規追加・維持しないでください。
変更時は`pnpm analytics:lint`、`pnpm analytics:type-check`、`pnpm analytics:build`で確認してください。
Cloudflare Worker、Convex HTTP action、認証secretなど本体と共有するセキュリティ境界の保証は、analytics-dashboard固有テストではなく、本体側のConvex Function Testやセキュリティレビューで扱ってください。

Vite、Storybook、Convex dev serverはユーザーが起動する前提です。
エージェントは勝手に開発サーバーを起動しないでください。

import { Migrations } from "@convex-dev/migrations";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";

export const migrations = new Migrations<DataModel>(components.migrations, {
  internalMutation,
});

// CI / CLI エントリポイント: `npx convex run migrations/index:run`
//
// 1ファイル1マイグレーション方式 — 詳細は `convex/CLAUDE.md` を参照。
//
// マイグレーションを追加するときは:
//   1. `convex/migrations/m{連番}_{名前}.ts` を作成し
//      `export const migration = migrations.define({...})` を書く
//   2. 下の run を以下のように書き換える:
//        import { internal } from "../_generated/api";
//        export const run = migrations.runner([
//          internal.migrations.m001_xxx.migration,
//          internal.migrations.m002_yyy.migration,
//        ]);
//   3. 新しいマイグレーションが増えたら配列末尾に追加（連番欠番禁止）
//
// 現時点ではマイグレーション未登録のため no-op で成功させる。
// これにより develop/prod の CI が「マイグレーション0件」で通過する。
export const run = internalMutation({
  args: {},
  handler: async () => ({ status: "no migrations registered" }),
});

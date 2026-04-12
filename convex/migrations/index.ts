import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "../_generated/api";
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
//   2. 下の runner 配列末尾に追加（連番欠番禁止）
export const run = migrations.runner([internal.migrations.m001_recruitments_add_shift_times.migration]);

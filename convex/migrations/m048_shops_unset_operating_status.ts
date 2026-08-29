import { migrations } from "./index";

type LegacyOperatingStatus = { operatingStatus?: unknown };

const migrationError = (code: "archived_not_allowed" | "unknown_status") =>
  new Error(`shops_operating_status_removal:${code}`);

/**
 * shops.operatingStatus の schema Narrow 前に、現行値 active だけを unset する。
 * archived / 未知値は削除状態へ推測変換せず、運用判断を要求するため停止する。
 */
export const migration = migrations.define({
  table: "shops",
  migrateOne: (_ctx, shop) => {
    const { operatingStatus } = shop as typeof shop & LegacyOperatingStatus;
    if (operatingStatus === undefined) return;
    if (operatingStatus === "archived") throw migrationError("archived_not_allowed");
    if (operatingStatus !== "active") throw migrationError("unknown_status");

    return { operatingStatus: undefined };
  },
});

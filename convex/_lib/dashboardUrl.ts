import type { Id } from "../_generated/dataModel";
import { APP_URL } from "./config";

export function buildShopDashboardUrl(args: { organizationId: Id<"organizations">; shopId: Id<"shops"> }): string {
  const url = new URL("/dashboard", APP_URL);
  url.searchParams.set("org", args.organizationId);
  url.searchParams.set("shop", args.shopId);
  return url.toString();
}

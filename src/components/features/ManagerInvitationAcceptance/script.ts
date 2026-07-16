import { normalizeAuthRedirect } from "@/src/lib/auth/redirect";
import type { ShopContextOption } from "@/src/stores/shop";
import { isSelectableShop } from "@/src/stores/shop";

export function buildManagerInvitationRedirect(token: string | undefined): string {
  const search = token === undefined ? "" : `?token=${encodeURIComponent(token)}`;
  return normalizeAuthRedirect(`/manager-invite${search}`);
}

export function buildManagerInvitationLoginUrl(invitationRedirect: string): string {
  const safeRedirect = normalizeAuthRedirect(invitationRedirect);
  return `/login?redirect=${encodeURIComponent(safeRedirect)}`;
}

export function formatManagerInvitationExpiry(expiresAt: number): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(expiresAt));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}年${value("month")}月${value("day")}日 ${value("hour")}:${value("minute")}`;
}

export function findAcceptedShopContext(
  shops: readonly ShopContextOption[],
  target: { organizationId: string; shopId: string },
): ShopContextOption | null {
  const shop = shops.find(
    (candidate) => candidate.shopId === target.shopId && candidate.organizationId === target.organizationId,
  );
  return shop && isSelectableShop(shop) ? shop : null;
}

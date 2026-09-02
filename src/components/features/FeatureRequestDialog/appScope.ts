import type { Id } from "@/convex/_generated/dataModel";

export type AppFeatureRequestShop = {
  id: Id<"shops">;
  name: string;
};

export type AppFeatureRequestScope = { kind: "shop"; shop: AppFeatureRequestShop } | { kind: "organization" };

/** 店舗画面だけ内部送信用の店舗IDを付け、組織画面は組織scopeのまま送る。 */
export function resolveAppFeatureRequestShopId(scope: AppFeatureRequestScope): Id<"shops"> | undefined {
  if (scope.kind === "shop") return scope.shop.id;
  return undefined;
}

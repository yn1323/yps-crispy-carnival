import { type OptionalRestArgsOrSkip, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { useAtomValue } from "jotai";
import { useManagerShopScope } from "@/src/providers/ManagerShopScopeProvider";
import { selectedShopAtom } from "@/src/stores/shop";

type ShopQueryReference = FunctionReference<"query", "public", { shopId: string; expectedOrganizationId: string }>;

/**
 * マネージャー系queryへ店舗scopeを注入する。
 * app routeではserver検証済みの明示scopeを優先し、それ以外ではcanonicalな選択中店舗を使う。
 */
export function useShopQuery<Q extends ShopQueryReference>(
  queryRef: Q,
  args: Omit<FunctionArgs<Q>, "shopId" | "expectedOrganizationId"> | "skip",
): FunctionReturnType<Q> | undefined {
  const managerShopScope = useManagerShopScope();
  const selectedShop = useAtomValue(selectedShopAtom);
  const scope =
    managerShopScope ??
    (selectedShop ? { shopId: selectedShop.shopId, expectedOrganizationId: selectedShop.organizationId } : null);
  const queryArgs =
    args === "skip" || !scope
      ? "skip"
      : ({
          ...args,
          ...scope,
        } as FunctionArgs<Q>);

  return useQuery(queryRef, ...([queryArgs] as unknown as OptionalRestArgsOrSkip<Q>));
}

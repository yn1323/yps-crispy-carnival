import { type OptionalRestArgsOrSkip, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { useAtomValue } from "jotai";
import { useManagerShopScope } from "@/src/providers/ManagerShopScopeProvider";
import { selectedShopAtom } from "@/src/stores/shop";

type ShopQueryReference = FunctionReference<"query", "public", { shopId?: string; expectedOrganizationId?: string }>;

/**
 * マネージャー系queryへ店舗scopeを注入する。
 * app routeではserver検証済みの明示scopeを優先し、旧画面では選択中店舗へフォールバックする。
 */
export function useShopQuery<Q extends ShopQueryReference>(
  queryRef: Q,
  args: Omit<FunctionArgs<Q>, "shopId"> | "skip",
): FunctionReturnType<Q> | undefined {
  const managerShopScope = useManagerShopScope();
  const selectedShop = useAtomValue(selectedShopAtom);
  const shopId = managerShopScope?.shopId ?? selectedShop?.shopId;
  const queryArgs =
    args === "skip" || !shopId
      ? "skip"
      : ({
          ...args,
          shopId,
          ...(managerShopScope ? { expectedOrganizationId: managerShopScope.expectedOrganizationId } : {}),
        } as FunctionArgs<Q>);

  return useQuery(queryRef, ...([queryArgs] as unknown as OptionalRestArgsOrSkip<Q>));
}

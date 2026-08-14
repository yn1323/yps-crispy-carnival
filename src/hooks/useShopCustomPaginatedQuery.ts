import type { PaginatedQueryArgs, PaginatedQueryReference, UsePaginatedQueryReturnType } from "convex/react";
import { usePaginatedQuery } from "convex-helpers/react";
import { useAtomValue } from "jotai";
import { useManagerShopScope } from "@/src/providers/ManagerShopScopeProvider";
import { selectedShopAtom } from "@/src/stores/shop";

type ShopPaginatedQueryReference = PaginatedQueryReference & {
  _args: PaginatedQueryReference["_args"] & { shopId?: string; expectedOrganizationId?: string };
};

/**
 * paginator / QueryStreamのendCursorを固定しつつ、店舗scopeを注入する。
 * app routeではserver検証済みの明示scopeを優先し、旧画面では選択中店舗へフォールバックする。
 */
export function useShopCustomPaginatedQuery<Q extends ShopPaginatedQueryReference>(
  queryRef: Q,
  args: Omit<PaginatedQueryArgs<Q>, "shopId"> | "skip",
  options: { initialNumItems: number },
): UsePaginatedQueryReturnType<Q> {
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
        } as unknown as PaginatedQueryArgs<Q>);

  return usePaginatedQuery(queryRef, queryArgs, options);
}

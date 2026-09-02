import type { PaginatedQueryArgs, PaginatedQueryReference, UsePaginatedQueryReturnType } from "convex/react";
import { usePaginatedQuery } from "convex-helpers/react";
import { useAtomValue } from "jotai";
import { useManagerShopScope } from "@/src/providers/ManagerShopScopeProvider";
import { selectedShopAtom } from "@/src/stores/shop";

type ShopPaginatedQueryReference = PaginatedQueryReference & {
  _args: PaginatedQueryReference["_args"] & { shopId: string; expectedOrganizationId: string };
};

/**
 * paginator / QueryStreamのendCursorを固定しつつ、店舗scopeを注入する。
 * app routeではserver検証済みの明示scopeを優先し、それ以外ではcanonicalな選択中店舗を使う。
 */
export function useShopCustomPaginatedQuery<Q extends ShopPaginatedQueryReference>(
  queryRef: Q,
  args: Omit<PaginatedQueryArgs<Q>, "shopId" | "expectedOrganizationId"> | "skip",
  options: { initialNumItems: number },
): UsePaginatedQueryReturnType<Q> {
  const managerShopScope = useManagerShopScope();
  const selectedShop = useAtomValue(selectedShopAtom);
  const scope =
    managerShopScope ??
    (selectedShop
      ? { shopId: selectedShop.shopId, expectedOrganizationId: selectedShop.organizationId }
      : null);
  const queryArgs =
    args === "skip" || !scope
      ? "skip"
      : ({
          ...args,
          ...scope,
        } as unknown as PaginatedQueryArgs<Q>);

  return usePaginatedQuery(queryRef, queryArgs, options);
}

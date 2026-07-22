import type { PaginatedQueryArgs, PaginatedQueryReference, UsePaginatedQueryReturnType } from "convex/react";
import { usePaginatedQuery } from "convex-helpers/react";
import { useAtomValue } from "jotai";
import { selectedShopAtom } from "@/src/stores/shop";

type ShopPaginatedQueryReference = PaginatedQueryReference & {
  _args: PaginatedQueryReference["_args"] & { shopId?: string };
};

/** paginator / QueryStream の endCursor を固定しつつ、選択中店舗を注入する paginated query ラッパー。 */
export function useShopCustomPaginatedQuery<Q extends ShopPaginatedQueryReference>(
  queryRef: Q,
  args: Omit<PaginatedQueryArgs<Q>, "shopId"> | "skip",
  options: { initialNumItems: number },
): UsePaginatedQueryReturnType<Q> {
  const selectedShop = useAtomValue(selectedShopAtom);
  const queryArgs =
    args === "skip" || !selectedShop?.shopId
      ? "skip"
      : ({ ...args, shopId: selectedShop.shopId } as unknown as PaginatedQueryArgs<Q>);

  return usePaginatedQuery(queryRef, queryArgs, options);
}

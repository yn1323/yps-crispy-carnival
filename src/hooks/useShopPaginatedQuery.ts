import {
  type PaginatedQueryArgs,
  type PaginatedQueryReference,
  type UsePaginatedQueryReturnType,
  usePaginatedQuery,
} from "convex/react";
import { useAtomValue } from "jotai";
import { selectedShopAtom } from "@/src/stores/shop";

type ShopPaginatedQueryReference = PaginatedQueryReference & {
  _args: PaginatedQueryReference["_args"] & { shopId?: string };
};

/** 選択中店舗を shopId として注入するマネージャー系 paginated query 用ラッパー。 */
export function useShopPaginatedQuery<Q extends ShopPaginatedQueryReference>(
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

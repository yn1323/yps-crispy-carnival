import { type OptionalRestArgsOrSkip, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { useAtomValue } from "jotai";
import { selectedShopAtom } from "@/src/stores/shop";

type ShopQueryReference = FunctionReference<"query", "public", { shopId?: string }>;

/** 選択中店舗を shopId として注入するマネージャー系 query 用ラッパー。 */
export function useShopQuery<Q extends ShopQueryReference>(
  queryRef: Q,
  args: Omit<FunctionArgs<Q>, "shopId"> | "skip",
): FunctionReturnType<Q> | undefined {
  const selectedShop = useAtomValue(selectedShopAtom);
  const queryArgs =
    args === "skip" || !selectedShop?.shopId ? "skip" : ({ ...args, shopId: selectedShop.shopId } as FunctionArgs<Q>);

  return useQuery(queryRef, ...([queryArgs] as unknown as OptionalRestArgsOrSkip<Q>));
}

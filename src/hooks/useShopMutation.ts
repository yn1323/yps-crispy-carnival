import { useMutation } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { selectedShopAtom } from "@/src/stores/shop";

type ShopMutationReference = FunctionReference<"mutation", "public", { shopId?: string }>;

/**
 * マネージャー系 mutation 用のラッパー。
 * 選択中店舗（selectedShopAtom）の shopId を自動で引数に注入する。
 * バックエンドの optional は段階リリース互換用であり、このhookでは省略しない。
 */
export function useShopMutation<M extends ShopMutationReference>(mutationRef: M) {
  const mutate = useMutation(mutationRef);
  const selectedShop = useAtomValue(selectedShopAtom);
  const shopId = selectedShop?.shopId;

  return useCallback(
    (args: Omit<FunctionArgs<M>, "shopId">): Promise<FunctionReturnType<M>> => {
      if (!shopId) {
        return Promise.reject(new Error("店舗が選択されていません"));
      }
      const mutationArgs = { ...args, shopId } as FunctionArgs<M>;
      return mutate(...([mutationArgs] as unknown as OptionalRestArgs<M>));
    },
    [mutate, shopId],
  );
}

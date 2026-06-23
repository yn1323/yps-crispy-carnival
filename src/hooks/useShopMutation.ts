import { useMutation } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { selectedShopAtom } from "@/src/stores/shop";

/**
 * マネージャー系 mutation 用のラッパー。
 * 選択中店舗（selectedShopAtom）の shopId を自動で引数に注入する。
 *
 * バックエンドの managerMutation は shopId を optional で受け取り、
 * 未指定なら先頭の所属店舗にフォールバックする。複数店舗マネージャーが
 * 操作対象店舗を明示できるようにするための入口。
 */
export function useShopMutation<M extends FunctionReference<"mutation">>(mutationRef: M) {
  const mutate = useMutation(mutationRef);
  const selectedShop = useAtomValue(selectedShopAtom);
  const shopId = selectedShop?.shopId;

  return useCallback(
    (args: Omit<FunctionArgs<M>, "shopId">): Promise<FunctionReturnType<M>> => {
      const merged = shopId ? { ...args, shopId } : args;
      return mutate(merged as FunctionArgs<M>);
    },
    [mutate, shopId],
  );
}

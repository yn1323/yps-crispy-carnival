import { useMutation } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { useManagerShopScope } from "@/src/providers/ManagerShopScopeProvider";
import { selectedShopAtom } from "@/src/stores/shop";

type ShopMutationReference = FunctionReference<
  "mutation",
  "public",
  { shopId?: string; expectedOrganizationId?: string }
>;

/**
 * マネージャー系 mutation 用のラッパー。
 * app routeではserver検証済みの明示scopeを優先し、旧画面では選択中店舗を注入する。
 * バックエンドの optional は段階リリース互換用であり、このhookでは省略しない。
 */
export function useShopMutation<M extends ShopMutationReference>(mutationRef: M) {
  const mutate = useMutation(mutationRef);
  const managerShopScope = useManagerShopScope();
  const selectedShop = useAtomValue(selectedShopAtom);
  const shopId = managerShopScope?.shopId ?? selectedShop?.shopId;

  return useCallback(
    (args: Omit<FunctionArgs<M>, "shopId" | "expectedOrganizationId">): Promise<FunctionReturnType<M>> => {
      if (!shopId) {
        return Promise.reject(new Error("店舗が選択されていません"));
      }
      const mutationArgs = {
        ...args,
        shopId,
        ...(managerShopScope ? { expectedOrganizationId: managerShopScope.expectedOrganizationId } : {}),
      } as FunctionArgs<M>;
      return mutate(...([mutationArgs] as unknown as OptionalRestArgs<M>));
    },
    [managerShopScope, mutate, shopId],
  );
}

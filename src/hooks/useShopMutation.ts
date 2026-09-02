import { useMutation } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { useManagerShopScope } from "@/src/providers/ManagerShopScopeProvider";
import { selectedShopAtom } from "@/src/stores/shop";

type ShopMutationReference = FunctionReference<
  "mutation",
  "public",
  { shopId: string; expectedOrganizationId: string }
>;

/**
 * マネージャー系 mutation 用のラッパー。
 * app routeではserver検証済みの明示scopeを優先し、それ以外ではcanonicalな選択中店舗を注入する。
 */
export function useShopMutation<M extends ShopMutationReference>(mutationRef: M) {
  const mutate = useMutation(mutationRef);
  const managerShopScope = useManagerShopScope();
  const selectedShop = useAtomValue(selectedShopAtom);
  const shopId = managerShopScope?.shopId ?? selectedShop?.shopId;
  const expectedOrganizationId = managerShopScope?.expectedOrganizationId ?? selectedShop?.organizationId;

  return useCallback(
    (args: Omit<FunctionArgs<M>, "shopId" | "expectedOrganizationId">): Promise<FunctionReturnType<M>> => {
      if (!shopId || !expectedOrganizationId) {
        return Promise.reject(new Error("店舗が選択されていません"));
      }
      const mutationArgs = {
        ...args,
        shopId,
        expectedOrganizationId,
      } as FunctionArgs<M>;
      return mutate(...([mutationArgs] as unknown as OptionalRestArgs<M>));
    },
    [expectedOrganizationId, mutate, shopId],
  );
}

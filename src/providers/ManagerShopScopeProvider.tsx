import { createContext, type ReactNode, useContext, useEffect } from "react";
import { setManagerMeasurementShop } from "@/src/lib/webMeasurement";

export type ManagerShopScope = {
  shopId: string;
  expectedOrganizationId: string;
};

const ManagerShopScopeContext = createContext<ManagerShopScope | null>(null);

type Props = ManagerShopScope & {
  children: ReactNode;
};

/** 新しいapp routeでserver検証済みの組織・店舗scopeを既存manager hookへ渡す。 */
export function ManagerShopScopeProvider({ shopId, expectedOrganizationId, children }: Props) {
  // 計測にも、画面が実際に操作している店舗を付ける。
  useEffect(() => {
    setManagerMeasurementShop(shopId);
    return () => setManagerMeasurementShop(null);
  }, [shopId]);

  return (
    <ManagerShopScopeContext.Provider value={{ shopId, expectedOrganizationId }}>
      {children}
    </ManagerShopScopeContext.Provider>
  );
}

export function useManagerShopScope(): ManagerShopScope | null {
  return useContext(ManagerShopScopeContext);
}

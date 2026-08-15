import { createContext, type ReactNode, useContext } from "react";

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
  return (
    <ManagerShopScopeContext.Provider value={{ shopId, expectedOrganizationId }}>
      {children}
    </ManagerShopScopeContext.Provider>
  );
}

export function useManagerShopScope(): ManagerShopScope | null {
  return useContext(ManagerShopScopeContext);
}

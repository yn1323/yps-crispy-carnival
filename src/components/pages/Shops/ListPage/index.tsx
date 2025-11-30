import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { api } from "@/convex/_generated/api";
import { ShopList, ShopListEmpty } from "@/src/components/features/Shop/ShopList";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { userAtom } from "@/src/stores/user";

export const ShopsListPage = () => {
  const user = useAtomValue(userAtom);
  const shops = useQuery(api.shop.queries.listByAuthId, user.authId ? { authId: user.authId } : "skip");

  if (!shops || shops.length === 0) {
    return (
      <LazyShow>
        <ShopListEmpty />
      </LazyShow>
    );
  }

  // 認証済みユーザーは常に新規店舗作成可能
  return <ShopList shops={shops} canCreateShop={true} />;
};

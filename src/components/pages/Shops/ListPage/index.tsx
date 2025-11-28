import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { api } from "@/convex/_generated/api";
import { ShopList, ShopListEmpty } from "@/src/components/features/Shop/ShopList";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { uniqueBy } from "@/src/helpers/utils/array";
import { userAtom } from "@/src/stores/user";

export const ShopsListPage = () => {
  const user = useAtomValue(userAtom);
  const shops = useQuery(api.shop.queries.listByAuthId, user.authId ? { authId: user.authId } : "skip");
  const canCreateShop = useQuery(api.shop.queries.canCreate, user.authId ? { authId: user.authId } : "skip");

  // 店舗IDで重複排除
  const uniqueShops = shops ? uniqueBy(shops, ["_id"]) : [];

  if (!uniqueShops || uniqueShops.length === 0) {
    return (
      <LazyShow>
        <ShopListEmpty />
      </LazyShow>
    );
  }

  return <ShopList shops={uniqueShops} canCreateShop={canCreateShop ?? false} />;
};

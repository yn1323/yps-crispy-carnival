import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { api } from "@/convex/_generated/api";
import { ShopList, ShopListEmpty } from "@/src/components/features/Shop/ShopList";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { uniqueBy } from "@/src/helpers/utils/array";
import { userAtom } from "@/src/stores/user";

export const ShopsListPage = () => {
  const [user] = useAtom(userAtom);
  const shops = useQuery(api.shop.getShopsByAuthId, user.authId ? { authId: user.authId } : "skip");
  const canCreateShop = useQuery(api.shop.canUserCreateShop, user.authId ? { authId: user.authId } : "skip");

  // 店舗IDで重複排除
  const uniqueShops = shops ? uniqueBy(shops, ["_id"]) : [];

  if (!uniqueShops || uniqueShops.length === 0) {
    return (
      <LazyShow>
        <div>{user.authId}</div>
        <ShopListEmpty />
      </LazyShow>
    );
  }

  return <ShopList shops={uniqueShops} canCreateShop={canCreateShop ?? false} />;
};

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShopEdit, ShopEditLoading } from "@/src/components/features/Shop/ShopEdit";
import { LazyShow } from "@/src/components/ui/LazyShow";

type Props = {
  shopId: string;
};

export const ShopsEditPage = ({ shopId }: Props) => {
  // 店舗情報取得
  const shop = useQuery(api.shop.queries.getById, { shopId: shopId as Id<"shops"> });

  // ローディング
  if (shop === undefined) {
    return (
      <LazyShow>
        <ShopEditLoading />
      </LazyShow>
    );
  }

  // 通常表示
  return <ShopEdit shop={shop} callbackRoutingPath={`/shops/${shopId}`} />;
};

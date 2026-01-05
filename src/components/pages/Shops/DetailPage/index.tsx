import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShopDetail, ShopDetailLoading, ShopDetailNotFound } from "@/src/components/features/Shop/ShopDetail";
import { LazyShow } from "@/src/components/ui/LazyShow";

type Props = {
  shopId: string;
};

export const ShopsDetailPage = ({ shopId }: Props) => {
  // 店舗情報取得
  const shop = useQuery(api.shop.queries.getById, { shopId: shopId as Id<"shops"> });
  // ポジション情報取得
  const positions = useQuery(api.position.queries.listByShop, { shopId: shopId as Id<"shops"> });

  // ローディング
  if (shop === undefined || positions === undefined) {
    return (
      <LazyShow>
        <ShopDetailLoading />
      </LazyShow>
    );
  }

  // 店舗が見つからない
  if (shop === null) {
    return <ShopDetailNotFound />;
  }

  return <ShopDetail shop={shop} positions={positions} />;
};

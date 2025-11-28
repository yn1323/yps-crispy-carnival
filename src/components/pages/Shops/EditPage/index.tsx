import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShopEdit, ShopEditLoading } from "@/src/components/features/Shop/ShopEdit";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { userAtom } from "@/src/stores/user";

type Props = {
  shopId: string;
};

export const ShopsEditPage = ({ shopId }: Props) => {
  const user = useAtomValue(userAtom);

  // 店舗情報取得
  const shop = useQuery(api.shop.queries.getById, { shopId: shopId as Id<"shops"> });

  // 現在のユーザー権限取得
  const userRole = useQuery(
    api.shop.queries.getUserRole,
    user.authId ? { shopId: shopId as Id<"shops">, authId: user.authId } : "skip",
  );

  // ローディング
  if (shop === undefined || userRole === undefined) {
    return (
      <LazyShow>
        <ShopEditLoading />
      </LazyShow>
    );
  }

  // 通常表示
  return <ShopEdit shop={shop} userRole={userRole} callbackRoutingPath={`/shops/${shopId}`} />;
};

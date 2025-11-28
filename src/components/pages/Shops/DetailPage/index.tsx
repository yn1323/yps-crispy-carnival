import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShopDetail, ShopDetailLoading, ShopDetailNotFound } from "@/src/components/features/Shop/ShopDetail";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { userAtom } from "@/src/stores/user";

type Props = {
  shopId: string;
};
export const ShopsDetailPage = ({ shopId }: Props) => {
  const user = useAtomValue(userAtom);

  // 店舗情報取得
  const shop = useQuery(api.shop.queries.getById, { shopId: shopId as Id<"shops"> });

  // スタッフ一覧取得
  const users = useQuery(
    api.shop.queries.listUsers,
    user.authId ? { shopId: shopId as Id<"shops">, authId: user.authId } : "skip",
  );

  // 現在のユーザー権限取得
  const userRole = useQuery(
    api.shop.queries.getUserRole,
    user.authId ? { shopId: shopId as Id<"shops">, authId: user.authId } : "skip",
  );

  // ローディング
  if (shop === undefined || users === undefined || userRole === undefined) {
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

  // 通常表示

  return <ShopDetail shop={shop} users={users} userRole={userRole} />;
};

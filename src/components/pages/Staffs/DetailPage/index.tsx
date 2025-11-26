import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { UserDetail, UserDetailLoading, UserDetailNotFound } from "@/src/components/features/User/UserDetail";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { userAtom } from "@/src/stores/user";

type Props = {
  userId: string;
  shopId: string;
};

export const StaffDetailPage = ({ userId, shopId }: Props) => {
  const [user] = useAtom(userAtom);

  // ユーザー情報取得
  const staffData = useQuery(api.user.getUserById, { userId: userId as Id<"users"> });

  // ユーザーの所属店舗一覧取得
  const shops = useQuery(api.user.getUserShops, { userId: userId as Id<"users"> });

  // 現在のユーザー権限取得
  const currentUserRole = useQuery(
    api.shop.getUserRoleInShop,
    user.authId ? { shopId: shopId as Id<"shops">, authId: user.authId } : "skip",
  );

  // 現在のログインユーザー情報取得（編集権限判定用）
  const currentUserData = useQuery(api.user.getUserByAuthId, user.authId ? { authId: user.authId } : "skip");

  // ローディング
  if (
    staffData === undefined ||
    shops === undefined ||
    currentUserRole === undefined ||
    currentUserData === undefined
  ) {
    return (
      <LazyShow>
        <UserDetailLoading />
      </LazyShow>
    );
  }

  // スタッフが見つからない
  if (staffData === null) {
    return <UserDetailNotFound />;
  }

  // 通常表示
  return (
    <UserDetail
      user={staffData}
      shops={shops}
      currentShopRole={currentUserRole}
      currentShopId={shopId}
      currentUserId={currentUserData?._id ?? null}
    />
  );
};

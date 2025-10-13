import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MemberDetail, MemberDetailLoading, MemberDetailNotFound } from "@/src/components/features/Member/MemberDetail";
import { TitleTemplate } from "@/src/components/templates/TitleTemplate";
import { userAtom } from "@/src/stores/user";

type Props = {
  userId: string;
  shopId: string;
};

export const MembersDetailPage = ({ userId, shopId }: Props) => {
  const [user] = useAtom(userAtom);

  // ユーザー情報取得
  const memberData = useQuery(api.user.getUserById, { userId: userId as Id<"users"> });

  // ユーザーの所属店舗一覧取得
  const shops = useQuery(api.user.getUserShops, { userId: userId as Id<"users"> });

  // 現在のユーザー権限取得
  const currentUserRole = useQuery(
    api.shop.getUserRoleInShop,
    user.authId ? { shopId: shopId as Id<"shops">, authId: user.authId } : "skip",
  );

  // ローディング
  if (memberData === undefined || shops === undefined || currentUserRole === undefined) {
    return <MemberDetailLoading />;
  }

  // メンバーが見つからない
  if (memberData === null) {
    return <MemberDetailNotFound />;
  }

  // 通常表示
  return (
    <TitleTemplate title="メンバー詳細">
      <MemberDetail user={memberData} shops={shops} currentShopRole={currentUserRole} currentShopId={shopId} />
    </TitleTemplate>
  );
};

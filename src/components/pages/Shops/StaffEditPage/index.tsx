import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffEdit, StaffEditLoading, StaffEditNotFound } from "@/src/components/features/Staff/StaffEdit";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { userAtom } from "@/src/stores/user";

type Props = {
  shopId: string;
  staffId: string;
};

export const StaffEditPage = ({ shopId, staffId }: Props) => {
  const user = useAtomValue(userAtom);

  // 店舗情報取得
  const shop = useQuery(api.shop.queries.getById, { shopId: shopId as Id<"shops"> });

  // スタッフ詳細取得
  const staff = useQuery(
    api.shop.queries.getStaffInfo,
    user.authId
      ? {
          shopId: shopId as Id<"shops">,
          staffId: staffId as Id<"staffs">,
          authId: user.authId,
        }
      : "skip",
  );

  // 店舗のポジション一覧取得
  const positions = useQuery(api.position.queries.listByShop, { shopId: shopId as Id<"shops"> });

  // スタッフのスキル一覧取得
  const staffSkills = useQuery(api.staffSkill.queries.listByStaff, { staffId: staffId as Id<"staffs"> });

  // ローディング
  if (shop === undefined || staff === undefined || positions === undefined || staffSkills === undefined) {
    return (
      <LazyShow>
        <StaffEditLoading />
      </LazyShow>
    );
  }

  // スタッフが見つからない
  if (shop === null || staff === null) {
    return <StaffEditNotFound shopId={shopId} />;
  }

  return <StaffEdit staff={staff} shop={shop} positions={positions} staffSkills={staffSkills} />;
};

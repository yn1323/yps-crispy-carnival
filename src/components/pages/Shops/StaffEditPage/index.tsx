import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffEdit, StaffEditLoading, StaffEditNotFound } from "@/src/components/features/Shop/StaffEdit";
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

  // ローディング
  if (shop === undefined || staff === undefined) {
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

  return <StaffEdit staff={staff} shop={shop} />;
};

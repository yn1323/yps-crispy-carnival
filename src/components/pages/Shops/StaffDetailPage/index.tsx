import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffDetail, StaffDetailLoading, StaffDetailNotFound } from "@/src/components/features/Staff/StaffDetail";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { userAtom } from "@/src/stores/user";

type Props = {
  shopId: string;
  staffId: string;
};

export const StaffDetailPage = ({ shopId, staffId }: Props) => {
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
        <StaffDetailLoading />
      </LazyShow>
    );
  }

  // スタッフが見つからない
  if (shop === null || staff === null) {
    return <StaffDetailNotFound shopId={shopId} />;
  }

  return <StaffDetail staff={staff} shop={shop} />;
};

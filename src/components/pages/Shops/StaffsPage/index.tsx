import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffList, StaffListLoading, StaffListNotFound } from "@/src/components/features/Shop/StaffList";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { userAtom } from "@/src/stores/user";

type Props = {
  shopId: string;
};

export const StaffsPage = ({ shopId }: Props) => {
  const user = useAtomValue(userAtom);

  // 店舗情報取得
  const shop = useQuery(api.shop.queries.getById, { shopId: shopId as Id<"shops"> });

  // スタッフ一覧取得
  const staffs = useQuery(
    api.shop.queries.listStaffs,
    user.authId ? { shopId: shopId as Id<"shops">, authId: user.authId } : "skip",
  );

  // ローディング
  if (shop === undefined || staffs === undefined) {
    return (
      <LazyShow>
        <StaffListLoading />
      </LazyShow>
    );
  }

  // 店舗が見つからない
  if (shop === null) {
    return <StaffListNotFound />;
  }

  return <StaffList shop={shop} staffs={staffs} />;
};

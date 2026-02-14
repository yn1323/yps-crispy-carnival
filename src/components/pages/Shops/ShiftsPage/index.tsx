import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  RecruitmentList,
  RecruitmentListLoading,
  RecruitmentListNotFound,
} from "@/src/components/features/Shift/RecruitmentList";
import { LazyShow } from "@/src/components/ui/LazyShow";

type Props = {
  shopId: string;
};

export const ShiftsPage = ({ shopId }: Props) => {
  const shop = useQuery(api.shop.queries.getById, { shopId: shopId as Id<"shops"> });
  const recruitments = useQuery(api.recruitment.queries.listByShop, { shopId: shopId as Id<"shops"> });

  // ローディング
  if (shop === undefined || recruitments === undefined) {
    return (
      <LazyShow>
        <RecruitmentListLoading />
      </LazyShow>
    );
  }

  // 店舗が見つからない
  if (shop === null) {
    return <RecruitmentListNotFound />;
  }

  return <RecruitmentList shop={shop} recruitments={recruitments} />;
};

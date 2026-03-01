import { Spinner } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { RecruitmentDetail } from "@/src/components/features/Shift/RecruitmentDetail";
import {
  generateDateRange,
  parseTimeRange,
  transformPositions,
  transformShiftRequests,
  transformStaffs,
} from "@/src/components/features/Shift/utils/transformRecruitmentData";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { userAtom } from "@/src/stores/user";

type Props = {
  shopId: string;
  recruitmentId: string;
};

export const RecruitmentDetailPage = ({ shopId, recruitmentId }: Props) => {
  const user = useAtomValue(userAtom);
  const typedShopId = shopId as Id<"shops">;
  const typedRecruitmentId = recruitmentId as Id<"recruitments">;

  const shop = useQuery(api.shop.queries.getById, { shopId: typedShopId });
  const recruitment = useQuery(api.recruitment.queries.getById, { recruitmentId: typedRecruitmentId });
  const shiftRequests = useQuery(api.shiftRequest.queries.listByRecruitment, { recruitmentId: typedRecruitmentId });
  const positions = useQuery(api.position.queries.listByShop, { shopId: typedShopId });
  const staffList = useQuery(
    api.shop.queries.listStaffs,
    user.authId ? { shopId: typedShopId, authId: user.authId } : "skip",
  );

  // ローディング
  if (
    shop === undefined ||
    recruitment === undefined ||
    shiftRequests === undefined ||
    positions === undefined ||
    staffList === undefined
  ) {
    return (
      <LazyShow>
        <Spinner size="xl" />
      </LazyShow>
    );
  }

  // 見つからない
  if (shop === null || recruitment === null) {
    return null;
  }

  // データ変換
  const dates = generateDateRange(recruitment.startDate, recruitment.endDate);
  const timeRange = parseTimeRange(shop);
  const transformedStaffs = transformStaffs({ staffList, shiftRequests });
  const transformedPositions = transformPositions(positions);
  const shifts = transformShiftRequests({ shiftRequests, staffList, positions: transformedPositions });

  return (
    <RecruitmentDetail
      shopId={shopId}
      recruitmentId={recruitmentId}
      recruitmentStatus={recruitment.status as "open" | "closed" | "confirmed"}
      staffs={transformedStaffs}
      positions={transformedPositions}
      shifts={shifts}
      dates={dates}
      timeRange={timeRange}
      holidays={[]}
    />
  );
};

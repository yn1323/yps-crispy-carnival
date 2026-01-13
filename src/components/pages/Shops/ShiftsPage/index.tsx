import { RecruitmentList } from "@/src/components/features/Shift/RecruitmentList";

type Props = {
  shopId: string;
};

// モックデータ（将来的にはuseQueryで取得）
const mockShop = {
  _id: "shop_1" as const,
  shopName: "サンプル店舗",
  openTime: "09:00",
  closeTime: "22:00",
  timeUnit: 30 as const,
  submitFrequency: "1w" as const,
  ownerId: "owner_1",
  createdAt: Date.now(),
};

const mockRecruitments = [
  {
    _id: "recruitment_1",
    startDate: "2025-12-01",
    endDate: "2025-12-07",
    deadline: "2025-11-25",
    status: "open" as const,
    appliedCount: 5,
    totalStaffCount: 8,
  },
  {
    _id: "recruitment_2",
    startDate: "2025-12-08",
    endDate: "2025-12-14",
    deadline: "2025-12-01",
    status: "closed" as const,
    appliedCount: 8,
    totalStaffCount: 8,
  },
  {
    _id: "recruitment_3",
    startDate: "2025-12-15",
    endDate: "2025-12-21",
    deadline: "2025-12-08",
    status: "confirmed" as const,
    appliedCount: 8,
    totalStaffCount: 8,
    confirmedAt: 1733788800000,
  },
];

export const ShiftsPage = ({ shopId }: Props) => {
  // 将来的にはuseQueryでデータ取得
  // const shop = useQuery(api.shop.queries.getById, { shopId: shopId as Id<"shops"> });
  // const recruitments = useQuery(api.shiftRecruitment.queries.listByShop, { shopId: shopId as Id<"shops"> });

  // モック実装のため、直接データを渡す
  const shop = { ...mockShop, _id: shopId };
  const recruitments = mockRecruitments;

  // 将来的なローディング・エラー処理
  // if (shop === undefined || recruitments === undefined) {
  //   return <LazyShow><RecruitmentListLoading /></LazyShow>;
  // }
  // if (shop === null) {
  //   return <RecruitmentListNotFound />;
  // }

  return <RecruitmentList shop={shop} recruitments={recruitments} />;
};

import { StaffingMatrix } from "@/src/components/features/Shift/StaffingMatrix";

type Props = {
  shopId: string;
};

// モックデータ（将来的にはuseQueryで取得）
const mockShop = {
  _id: "shop_1",
  shopName: "サンプル店舗",
  openTime: "09:00",
  closeTime: "22:00",
};

const mockPositions = [
  { _id: "pos_1", name: "ホール" },
  { _id: "pos_2", name: "キッチン" },
  { _id: "pos_3", name: "その他" },
];

export const StaffingSettingsPage = ({ shopId }: Props) => {
  // 将来的にはuseQueryでデータ取得
  // const shop = useQuery(api.shop.queries.getById, { shopId: shopId as Id<"shops"> });
  // const positions = useQuery(api.position.queries.listByShop, { shopId: shopId as Id<"shops"> });
  // const requiredStaffing = useQuery(api.requiredStaffing.queries.listByShop, { shopId: shopId as Id<"shops"> });

  // モック実装のため、直接データを渡す
  const shop = { ...mockShop, _id: shopId };
  const positions = mockPositions;

  // 将来的なローディング・エラー処理
  // if (shop === undefined || positions === undefined) {
  //   return <LazyShow><StaffingMatrixLoading /></LazyShow>;
  // }

  return <StaffingMatrix shopId={shopId} shop={shop} positions={positions} initialStaffing={[]} />;
};

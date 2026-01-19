import { ShiftEditor } from "@/src/components/features/Shift/ShiftEditor";

type Props = {
  shopId: string;
  recruitmentId: string;
};

// モックデータ（将来的にはuseQueryで取得）
const mockRecruitment = {
  _id: "recruitment_1",
  startDate: "2025-12-01",
  endDate: "2025-12-07",
};

// 希望シフトのモックデータ
const mockShiftRequests = [
  {
    _id: "req_1",
    recruitmentId: "recruitment_1",
    staffId: "staff_1",
    staffName: "田中太郎",
    date: "2025-12-01",
    startTime: "09:00",
    endTime: "17:00",
  },
  {
    _id: "req_2",
    recruitmentId: "recruitment_1",
    staffId: "staff_2",
    staffName: "山田花子",
    date: "2025-12-01",
    startTime: "11:00",
    endTime: "19:00",
  },
  {
    _id: "req_3",
    recruitmentId: "recruitment_1",
    staffId: "staff_3",
    staffName: "鈴木次郎",
    date: "2025-12-01",
    startTime: "10:00",
    endTime: "18:00",
  },
  {
    _id: "req_4",
    recruitmentId: "recruitment_1",
    staffId: "staff_1",
    staffName: "田中太郎",
    date: "2025-12-02",
    startTime: "10:00",
    endTime: "18:00",
  },
  {
    _id: "req_5",
    recruitmentId: "recruitment_1",
    staffId: "staff_2",
    staffName: "山田花子",
    date: "2025-12-03",
    startTime: "09:00",
    endTime: "15:00",
  },
];

// ポジション選択肢のモックデータ
const mockPositions = [
  { value: "hall", label: "ホール" },
  { value: "kitchen", label: "キッチン" },
  { value: "register", label: "レジ" },
];

// 必要人員のモックデータ（月曜日 = 1）
const mockRequiredStaffing = [
  { _id: "rs_1", shopId: "shop_1", dayOfWeek: 1, hour: 9, position: "ホール", requiredCount: 2 },
  { _id: "rs_2", shopId: "shop_1", dayOfWeek: 1, hour: 9, position: "キッチン", requiredCount: 1 },
  { _id: "rs_3", shopId: "shop_1", dayOfWeek: 1, hour: 10, position: "ホール", requiredCount: 2 },
  { _id: "rs_4", shopId: "shop_1", dayOfWeek: 1, hour: 10, position: "キッチン", requiredCount: 1 },
  { _id: "rs_5", shopId: "shop_1", dayOfWeek: 1, hour: 11, position: "ホール", requiredCount: 3 },
  { _id: "rs_6", shopId: "shop_1", dayOfWeek: 1, hour: 11, position: "キッチン", requiredCount: 2 },
  { _id: "rs_7", shopId: "shop_1", dayOfWeek: 1, hour: 12, position: "ホール", requiredCount: 3 },
  { _id: "rs_8", shopId: "shop_1", dayOfWeek: 1, hour: 12, position: "キッチン", requiredCount: 2 },
];

export const ShiftConfirmPage = ({ shopId, recruitmentId }: Props) => {
  // 将来的にはuseQueryでデータ取得
  // const recruitment = useQuery(api.recruitment.queries.getById, { recruitmentId });
  // const shiftRequests = useQuery(api.shiftRequest.queries.listByRecruitment, { recruitmentId });
  // const positions = useQuery(api.position.queries.listByShop, { shopId });
  // const requiredStaffing = useQuery(api.staffing.queries.listByShop, { shopId });

  // 将来的なローディング・エラー処理
  // if (recruitment === undefined || shiftRequests === undefined) {
  //   return <LoadingState />;
  // }
  // if (recruitment === null) {
  //   return <NotFoundState />;
  // }

  return (
    <ShiftEditor
      shopId={shopId}
      recruitmentId={recruitmentId}
      recruitment={mockRecruitment}
      shiftRequests={mockShiftRequests}
      positions={mockPositions}
      requiredStaffing={mockRequiredStaffing}
    />
  );
};

import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";

type Props = {
  shopId: string;
  recruitmentId: string;
};

// モックデータ（将来的にはuseQueryで取得）
const mockStaffs = [
  { id: "staff_1", name: "田中太郎", isSubmitted: true },
  { id: "staff_2", name: "山田花子", isSubmitted: true },
  { id: "staff_3", name: "鈴木次郎", isSubmitted: true },
];

const mockPositions = [
  { id: "pos_hall", name: "ホール", color: "#3b82f6" },
  { id: "pos_kitchen", name: "キッチン", color: "#f97316" },
  { id: "pos_register", name: "レジ", color: "#10b981" },
];

const mockDates = ["2025-12-01", "2025-12-02", "2025-12-03", "2025-12-04", "2025-12-05", "2025-12-06", "2025-12-07"];

const mockShifts = [
  {
    id: "shift_1",
    staffId: "staff_1",
    staffName: "田中太郎",
    date: "2025-12-01",
    requestedTime: { start: "09:00", end: "17:00" },
    positions: [
      { id: "seg_1", positionId: "pos_hall", positionName: "ホール", color: "#3b82f6", start: "09:00", end: "17:00" },
    ],
  },
  {
    id: "shift_2",
    staffId: "staff_2",
    staffName: "山田花子",
    date: "2025-12-01",
    requestedTime: { start: "11:00", end: "19:00" },
    positions: [
      {
        id: "seg_2",
        positionId: "pos_kitchen",
        positionName: "キッチン",
        color: "#f97316",
        start: "11:00",
        end: "19:00",
      },
    ],
  },
  {
    id: "shift_3",
    staffId: "staff_3",
    staffName: "鈴木次郎",
    date: "2025-12-01",
    requestedTime: { start: "10:00", end: "18:00" },
    positions: [
      {
        id: "seg_3",
        positionId: "pos_register",
        positionName: "レジ",
        color: "#10b981",
        start: "10:00",
        end: "18:00",
      },
    ],
  },
  {
    id: "shift_4",
    staffId: "staff_1",
    staffName: "田中太郎",
    date: "2025-12-02",
    requestedTime: { start: "10:00", end: "18:00" },
    positions: [
      { id: "seg_4", positionId: "pos_hall", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "18:00" },
    ],
  },
  {
    id: "shift_5",
    staffId: "staff_2",
    staffName: "山田花子",
    date: "2025-12-03",
    requestedTime: { start: "09:00", end: "15:00" },
    positions: [
      {
        id: "seg_5",
        positionId: "pos_kitchen",
        positionName: "キッチン",
        color: "#f97316",
        start: "09:00",
        end: "15:00",
      },
    ],
  },
];

export const ShiftConfirmPage = ({ shopId }: Props) => {
  // 将来的にはuseQueryでデータ取得
  // const recruitment = useQuery(api.recruitment.queries.getById, { recruitmentId });
  // const shiftRequests = useQuery(api.shiftRequest.queries.listByRecruitment, { recruitmentId });
  // const positions = useQuery(api.position.queries.listByShop, { shopId });

  return (
    <ShiftForm
      shopId={shopId}
      staffs={mockStaffs}
      positions={mockPositions}
      initialShifts={mockShifts}
      dates={mockDates}
      timeRange={{ start: 9, end: 22, unit: 30 }}
      holidays={[]}
      isReadOnly
    />
  );
};

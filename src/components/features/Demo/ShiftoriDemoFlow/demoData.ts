import type { CreateRecruitmentData } from "@/src/components/features/Dashboard/CreateRecruitmentForm";
import type { SubmissionData } from "@/src/components/features/StaffSubmit/SubmitFormView";
import { BREAK_POSITION, DEFAULT_POSITION } from "@/src/domains/shift/constants";
import { formatDateWithWeekday, getDateRange } from "@/src/domains/shift/date";
import type { PositionType, ShiftData, StaffType, TimeRange } from "@/src/domains/shift/types";

export type DemoStep = "recruit" | "submit" | "adjust" | "share";

export type StepDefinition = {
  id: DemoStep;
  label: string;
  title: string;
  description: string;
};

export const FORM_ID = "create-recruitment-form";
export const SHOP_NAME = "カフェ シフトリ";
export const PERIOD_START = "2027-06-07";
export const PERIOD_END = "2027-06-13";
export const DEADLINE = "2027-06-05";
export const TIME_RANGE: TimeRange = { start: 9, end: 22, unit: 30 };
export const POSITIONS: PositionType[] = [
  DEFAULT_POSITION,
  { id: "demo-break", name: BREAK_POSITION.name, color: BREAK_POSITION.color },
];

export const STAFFS: StaffType[] = [
  { id: "staff-aya", name: "佐藤あや", isSubmitted: true },
  { id: "staff-kenta", name: "田中健太", isSubmitted: true },
  { id: "staff-mio", name: "山田みお", isSubmitted: true },
  { id: "staff-ren", name: "高橋れん", isSubmitted: true },
  { id: "staff-yui", name: "井上ゆい", isSubmitted: true },
  { id: "staff-haruto", name: "中村はると", isSubmitted: true },
  { id: "staff-nana", name: "小林なな", isSubmitted: true },
  { id: "staff-sou", name: "松本そう", isSubmitted: true },
];

export const STEPS: StepDefinition[] = [
  {
    id: "recruit",
    label: "募集",
    title: "シフトを募集してみよう",
    description: "まずは期間と締切を決めて、スタッフに希望シフトを集める準備をします。",
  },
  {
    id: "submit",
    label: "提出",
    title: "シフトを提出してみよう",
    description: "スタッフ側の画面で、出勤できる日と時間を入力する流れを確認します。",
  },
  {
    id: "adjust",
    label: "調整",
    title: "シフトを確定しよう",
    description: "集まった希望を見ながら、時間帯の重なりを調整してシフトを確定します。",
  },
  {
    id: "share",
    label: "共有",
    title: "確定シフトのメールを見てみよう",
    description: "確定後にスタッフへ届くメールと、確認リンクの見え方を確認します。",
  },
];

export const DEFAULT_RECRUITMENT: CreateRecruitmentData = {
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  deadline: DEADLINE,
};

export const SUBMISSION_DATA: SubmissionData = {
  shopName: SHOP_NAME,
  staffName: "佐藤あや",
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  deadline: DEADLINE,
  isBeforeDeadline: true,
  hasSubmitted: false,
  existingRequests: [
    { date: "2027-06-07", startTime: "10:00", endTime: "16:00" },
    { date: "2027-06-09", startTime: "11:00", endTime: "17:00" },
    { date: "2027-06-12", startTime: "09:00", endTime: "15:00" },
  ],
  legalConsentRequired: false,
  legalDocuments: {
    terms: {
      title: "スタッフ向け利用規約",
      documentVersion: "staff-terms-doc-demo",
      requiredConsentVersion: "staff-terms-consent-demo",
      path: "/terms/staff",
    },
    privacy: {
      title: "スタッフ向けプライバシーポリシー",
      documentVersion: "staff-privacy-doc-demo",
      requiredConsentVersion: "staff-privacy-consent-demo",
      path: "/privacy/staff",
    },
  },
  timeRange: { startTime: "09:00", endTime: "22:00" },
  previousWeeklyPattern: null,
};

type DemoShiftSeed = {
  staffId: StaffType["id"];
  date: string;
  start: string;
  end: string;
};

const staffById = new Map(STAFFS.map((staff) => [staff.id, staff]));

const createShift = ({ staffId, date, start, end }: DemoShiftSeed): ShiftData => {
  const staff = getDemoStaff(staffId);
  return {
    id: `demo-shift-${staff.id}-${date}`,
    staffId,
    staffName: staff.name,
    date,
    requestedTime: { start, end },
    positions: [
      {
        id: `seg-${staffId}-${date}`,
        positionId: DEFAULT_POSITION.id,
        positionName: DEFAULT_POSITION.name,
        color: DEFAULT_POSITION.color,
        start,
        end,
      },
    ],
  };
};

const getDemoStaff = (staffId: StaffType["id"]): StaffType => {
  const staff = staffById.get(staffId);
  if (!staff) {
    throw new Error(`Unknown demo staff: ${staffId}`);
  }
  return staff;
};

const DEMO_SHIFT_SEEDS: DemoShiftSeed[] = [
  { staffId: "staff-mio", date: "2027-06-07", start: "09:00", end: "15:00" },
  { staffId: "staff-yui", date: "2027-06-07", start: "10:00", end: "16:00" },
  { staffId: "staff-kenta", date: "2027-06-07", start: "10:30", end: "18:30" },
  { staffId: "staff-ren", date: "2027-06-07", start: "11:30", end: "19:30" },
  { staffId: "staff-sou", date: "2027-06-07", start: "12:00", end: "20:00" },
  { staffId: "staff-aya", date: "2027-06-07", start: "13:00", end: "21:00" },
  { staffId: "staff-haruto", date: "2027-06-07", start: "15:30", end: "22:00" },
  { staffId: "staff-nana", date: "2027-06-07", start: "17:00", end: "22:00" },

  { staffId: "staff-mio", date: "2027-06-08", start: "09:00", end: "16:00" },
  { staffId: "staff-aya", date: "2027-06-08", start: "09:30", end: "14:30" },
  { staffId: "staff-ren", date: "2027-06-08", start: "10:00", end: "18:00" },
  { staffId: "staff-haruto", date: "2027-06-08", start: "11:00", end: "19:00" },
  { staffId: "staff-yui", date: "2027-06-08", start: "12:00", end: "20:00" },
  { staffId: "staff-nana", date: "2027-06-08", start: "14:00", end: "22:00" },
  { staffId: "staff-kenta", date: "2027-06-08", start: "16:00", end: "22:00" },

  { staffId: "staff-sou", date: "2027-06-09", start: "09:00", end: "15:00" },
  { staffId: "staff-mio", date: "2027-06-09", start: "09:30", end: "16:30" },
  { staffId: "staff-aya", date: "2027-06-09", start: "10:00", end: "17:00" },
  { staffId: "staff-haruto", date: "2027-06-09", start: "11:30", end: "20:30" },
  { staffId: "staff-yui", date: "2027-06-09", start: "12:00", end: "21:00" },
  { staffId: "staff-ren", date: "2027-06-09", start: "15:00", end: "22:00" },
  { staffId: "staff-nana", date: "2027-06-09", start: "16:30", end: "22:00" },

  { staffId: "staff-haruto", date: "2027-06-10", start: "09:00", end: "15:00" },
  { staffId: "staff-sou", date: "2027-06-10", start: "09:30", end: "17:30" },
  { staffId: "staff-mio", date: "2027-06-10", start: "10:00", end: "16:00" },
  { staffId: "staff-nana", date: "2027-06-10", start: "11:00", end: "19:00" },
  { staffId: "staff-aya", date: "2027-06-10", start: "13:00", end: "21:00" },
  { staffId: "staff-yui", date: "2027-06-10", start: "14:30", end: "22:00" },
  { staffId: "staff-kenta", date: "2027-06-10", start: "17:00", end: "22:00" },

  { staffId: "staff-ren", date: "2027-06-11", start: "09:00", end: "15:00" },
  { staffId: "staff-yui", date: "2027-06-11", start: "10:00", end: "16:00" },
  { staffId: "staff-kenta", date: "2027-06-11", start: "10:30", end: "18:30" },
  { staffId: "staff-mio", date: "2027-06-11", start: "11:30", end: "19:30" },
  { staffId: "staff-haruto", date: "2027-06-11", start: "13:00", end: "21:00" },
  { staffId: "staff-sou", date: "2027-06-11", start: "15:30", end: "22:00" },

  { staffId: "staff-aya", date: "2027-06-12", start: "09:00", end: "15:00" },
  { staffId: "staff-mio", date: "2027-06-12", start: "09:30", end: "17:30" },
  { staffId: "staff-ren", date: "2027-06-12", start: "10:00", end: "18:00" },
  { staffId: "staff-nana", date: "2027-06-12", start: "10:30", end: "16:30" },
  { staffId: "staff-yui", date: "2027-06-12", start: "11:30", end: "20:30" },
  { staffId: "staff-kenta", date: "2027-06-12", start: "13:00", end: "22:00" },
  { staffId: "staff-haruto", date: "2027-06-12", start: "15:00", end: "22:00" },
  { staffId: "staff-sou", date: "2027-06-12", start: "17:00", end: "22:00" },

  { staffId: "staff-yui", date: "2027-06-13", start: "09:00", end: "15:00" },
  { staffId: "staff-aya", date: "2027-06-13", start: "09:30", end: "16:30" },
  { staffId: "staff-ren", date: "2027-06-13", start: "10:00", end: "17:00" },
  { staffId: "staff-nana", date: "2027-06-13", start: "11:00", end: "19:00" },
  { staffId: "staff-sou", date: "2027-06-13", start: "12:00", end: "20:00" },
  { staffId: "staff-haruto", date: "2027-06-13", start: "14:00", end: "22:00" },
  { staffId: "staff-kenta", date: "2027-06-13", start: "16:00", end: "22:00" },
];

export const buildDemoShifts = (): ShiftData[] => DEMO_SHIFT_SEEDS.map(createShift);

export const dates = getDateRange(PERIOD_START, PERIOD_END);
export const periodLabel = `${formatDateWithWeekday(PERIOD_START)}〜${formatDateWithWeekday(PERIOD_END)}`;
export const stepIndexById = new Map(STEPS.map((step, index) => [step.id, index]));

import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import dayjs from "dayjs";
import { buildDashboardRecruitmentGroups, type Recruitment } from "@/src/components/features/Dashboard/types";
import { RecruitmentBoard, RecruitmentBoardSkeleton } from ".";

const noop = () => {};
const dateInDays = (days: number) => dayjs().add(days, "day").format("YYYY-MM-DD");
const makeRecruitment = (overrides: Partial<Recruitment> = {}) =>
  ({
    _id: "rec-collecting",
    createdAt: Date.now(),
    periodStart: dateInDays(10),
    periodEnd: dateInDays(20),
    deadline: dateInDays(5),
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    responseCount: 1,
    totalStaffCount: 10,
    ...overrides,
  }) as unknown as Recruitment;

const currentRecruitment = makeRecruitment({
  _id: "rec-current" as Recruitment["_id"],
  createdAt: Date.now() - 3_000,
  periodStart: dateInDays(-5),
  periodEnd: dateInDays(5),
  deadline: dateInDays(-8),
  status: "confirmed",
  confirmedAt: Date.now() - 2_000,
  responseCount: 10,
  totalStaffCount: 10,
});
const actionRequiredRecruitment = makeRecruitment({
  _id: "rec-action-required" as Recruitment["_id"],
  createdAt: Date.now() - 2_000,
  periodStart: dateInDays(4),
  periodEnd: dateInDays(12),
  deadline: dateInDays(-1),
  responseCount: 3,
});
const collectingSoonRecruitment = makeRecruitment({
  _id: "rec-collecting-soon" as Recruitment["_id"],
  createdAt: Date.now() - 1_000,
  periodStart: dateInDays(8),
  periodEnd: dateInDays(16),
  deadline: dateInDays(2),
});
const collectingLaterRecruitment = makeRecruitment({
  _id: "rec-collecting-later" as Recruitment["_id"],
  periodStart: dateInDays(14),
  periodEnd: dateInDays(22),
  deadline: dateInDays(6),
});
const futureConfirmed = makeRecruitment({
  _id: "rec-future-confirmed" as Recruitment["_id"],
  periodStart: dateInDays(24),
  periodEnd: dateInDays(31),
  deadline: dateInDays(20),
  status: "confirmed",
  confirmedAt: Date.now(),
  responseCount: 10,
  totalStaffCount: 10,
});
const recentPastRecruitment = makeRecruitment({
  _id: "rec-past-recent" as Recruitment["_id"],
  periodStart: dateInDays(-30),
  periodEnd: dateInDays(-16),
  deadline: dateInDays(-40),
  status: "confirmed",
  confirmedAt: Date.now() - 20_000,
  responseCount: 10,
  totalStaffCount: 10,
});
const olderPastRecruitment = makeRecruitment({
  _id: "rec-past-older" as Recruitment["_id"],
  periodStart: dateInDays(-60),
  periodEnd: dateInDays(-46),
  deadline: dateInDays(-70),
  status: "confirmed",
  confirmedAt: Date.now() - 30_000,
  responseCount: 10,
  totalStaffCount: 10,
});
const dashboardRecruitments = [
  currentRecruitment,
  actionRequiredRecruitment,
  collectingSoonRecruitment,
  collectingLaterRecruitment,
  futureConfirmed,
];
const dashboardGroups = buildDashboardRecruitmentGroups({ recruitments: dashboardRecruitments }).groups;
const groupsFor = (
  recruitments: Recruitment[],
  options: Omit<Parameters<typeof buildDashboardRecruitmentGroups>[0], "recruitments"> = {},
) => buildDashboardRecruitmentGroups({ ...options, recruitments }).groups;
const assertText = (root: HTMLElement, text: string, label: string) => {
  if (!root.textContent?.includes(text)) throw new Error(`${label} が表示されませんでした`);
};

const meta = {
  title: "Features/Dashboard/RecruitmentBoard",
  component: RecruitmentBoard,
  parameters: {
    layout: "padded",
  },
  args: {
    groups: dashboardGroups,
    pastStatus: "Exhausted",
    hasPastRecruitments: true,
    isPastRecruitmentsVisible: false,
    canLoadMorePastRecruitments: false,
    onCreateClick: noop,
    onOpenShiftBoard: noop,
    onDeleteRecruitment: noop,
    onShowPastRecruitments: noop,
    onLoadMorePastRecruitments: noop,
  },
  decorators: [
    (Story) => (
      <Stack maxW="720px" mx="auto" w="full">
        <Story />
      </Stack>
    ),
  ],
} satisfies Meta<typeof RecruitmentBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ActionRequired: Story = {
  args: {
    groups: groupsFor([actionRequiredRecruitment, collectingSoonRecruitment]),
  },
};

export const CollectingOnly: Story = {
  args: {
    groups: groupsFor([collectingSoonRecruitment, collectingLaterRecruitment]),
  },
};

export const FutureConfirmed: Story = {
  args: {
    groups: groupsFor([futureConfirmed]),
  },
};

export const WithPastEntryButton: Story = {
  args: {
    groups: dashboardGroups,
    hasPastRecruitments: true,
    isPastRecruitmentsVisible: false,
  },
};

export const Empty: Story = {
  args: {
    groups: [],
    hasPastRecruitments: false,
    isPastRecruitmentsVisible: false,
  },
};

export const OnlyPastExists: Story = {
  args: {
    groups: [],
    hasPastRecruitments: true,
    isPastRecruitmentsVisible: false,
  },
};

export const OnlyCurrentShift: Story = {
  args: {
    groups: groupsFor([currentRecruitment]),
  },
};

export const MultipleGroupsMobile: Story = {
  args: {
    groups: dashboardGroups,
    hasPastRecruitments: true,
    isPastRecruitmentsVisible: false,
  },
  parameters: {
    viewport: { value: "mobile1", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    assertText(canvasElement, "現在のシフト", "現在のシフト見出し");
    assertText(canvasElement, "要シフト調整", "要シフト調整見出し");
    assertText(canvasElement, "募集中", "募集中見出し");
    assertText(canvasElement, "確定済み", "確定済み見出し");
    assertText(canvasElement, "過去のシフトを見る", "過去のシフト導線");
  },
};

export const PastLoadedCanLoadMore: Story = {
  args: {
    groups: groupsFor([...dashboardRecruitments, recentPastRecruitment, olderPastRecruitment]),
    hasPastRecruitments: true,
    isPastRecruitmentsVisible: true,
    pastStatus: "CanLoadMore",
    canLoadMorePastRecruitments: true,
  },
  parameters: {
    viewport: { value: "mobile1", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    assertText(canvasElement, "過去のシフト", "過去のシフト見出し");
    assertText(canvasElement, "もっと見る", "過去シフト追加導線");
  },
};

export const PastLoadedExhausted: Story = {
  args: {
    groups: groupsFor([...dashboardRecruitments, recentPastRecruitment, olderPastRecruitment]),
    hasPastRecruitments: true,
    isPastRecruitmentsVisible: true,
    pastStatus: "Exhausted",
    canLoadMorePastRecruitments: false,
  },
};

export const Loading: Story = {
  render: () => <RecruitmentBoardSkeleton />,
};

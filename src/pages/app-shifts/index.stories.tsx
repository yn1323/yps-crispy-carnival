import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { RecruitmentBoard } from "@/src/components/features/Dashboard/RecruitmentBoard";
import type { DashboardRecruitmentGroup, Recruitment } from "@/src/components/features/Dashboard/types";
import { AuthenticatedAppShell } from "@/src/components/templates/AuthenticatedAppShell";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { AppShiftsOverviewView, AppShiftsPageStateView } from ".";

const recruitment = (overrides: Partial<Recruitment> = {}): Recruitment =>
  ({
    _id: "recruitment-preview" as never,
    createdAt: Date.UTC(2026, 7, 1),
    periodStart: "2026-08-26",
    periodEnd: "2026-08-28",
    deadline: "2026-08-20",
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    responseCount: 2,
    totalStaffCount: 5,
    ...overrides,
  }) as Recruitment;

const actionMain = recruitment({
  _id: "recruitment-action-main" as never,
  periodStart: "2026-08-17",
  periodEnd: "2026-08-24",
  deadline: "2026-08-12",
  responseCount: 2,
  totalStaffCount: 3,
});
const actionAnnex = recruitment({
  _id: "recruitment-action-annex" as never,
  periodStart: "2026-08-20",
  periodEnd: "2026-08-27",
  deadline: "2026-08-13",
  responseCount: 1,
});
const collectingMain = recruitment({ _id: "recruitment-collecting-main" as never });

const groups: DashboardRecruitmentGroup[] = [
  {
    key: "actionRequired",
    title: "要シフト調整",
    recruitments: [actionMain, actionAnnex],
    totalCount: 2,
  },
  {
    key: "collecting",
    title: "募集中",
    recruitments: [collectingMain],
    totalCount: 1,
  },
];

const shopNames = new Map<Recruitment["_id"], string>([
  [actionMain._id, "yn1323店舗"],
  [actionAnnex._id, "もて"],
  [collectingMain._id, "yn1323店舗"],
]);
const filterOptions = [
  { value: "shop-main", label: "yn1323店舗" },
  { value: "shop-annex", label: "もて" },
  { value: "shop-work", label: "勤務区分" },
];

function CombinedBoard() {
  return (
    <RecruitmentBoard
      groups={groups}
      pastStatus="Exhausted"
      hasPastRecruitments={false}
      isPastRecruitmentsVisible={false}
      canLoadMorePastRecruitments={false}
      showRecruitmentMenus
      canDeleteRecruitments
      getRecruitmentShopName={(item) => shopNames.get(item._id)}
      onCreateClick={() => undefined}
      onOpenShiftBoard={() => undefined}
      onDeleteRecruitment={() => undefined}
      onShowPastRecruitments={() => undefined}
      onLoadMorePastRecruitments={() => undefined}
    />
  );
}

function ReadyPreview({ isReadOnly = false }: { isReadOnly?: boolean }) {
  return (
    <Stack maxW="1024px" mx="auto">
      <AppShiftsOverviewView
        filterValue={null}
        filterOptions={filterOptions}
        isReadOnly={isReadOnly}
        onFilterChange={() => undefined}
      >
        <CombinedBoard />
      </AppShiftsOverviewView>
    </Stack>
  );
}

function AppCompositionPreview() {
  return (
    <AuthenticatedAppShell activeKey="shifts" activeOrganizationId="organization-preview">
      <AuthenticatedPageContent includeMobileNavigation>
        <ReadyPreview />
      </AuthenticatedPageContent>
    </AuthenticatedAppShell>
  );
}

const meta = {
  title: "Pages/AppShifts/States",
  component: AppShiftsPageStateView,
  args: { state: { kind: "loading" } },
  parameters: { layout: "padded" },
} satisfies Meta<typeof AppShiftsPageStateView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

export const Empty: Story = {
  args: { state: { kind: "empty" } },
};

export const QueryError: Story = {
  args: { state: { kind: "error" } },
};

export const ReadyDesktop: Story = {
  render: () => <ReadyPreview />,
};

export const ReadyMobileSmall: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <ReadyPreview />,
};

export const ReadyMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <ReadyPreview />,
};

export const AppCompositionDesktop: Story = {
  name: "シフト一覧・新shell・デスクトップ",
  parameters: { layout: "fullscreen", vrt: { releaseFixedHeader: true } },
  render: () => <AppCompositionPreview />,
};

export const AppCompositionMobile: Story = {
  ...AppCompositionDesktop,
  name: "シフト一覧・新shell・モバイル414px",
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const ReadOnlyMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <ReadyPreview isReadOnly />,
};

function FilterPreview({ singleShop = false }: { singleShop?: boolean }) {
  const [filter, setFilter] = useState<string | null>(null);
  return (
    <AppShiftsOverviewView
      filterValue={filter}
      filterOptions={singleShop ? filterOptions.slice(0, 1) : filterOptions}
      onFilterChange={setFilter}
    >
      <output>選択中：{filter ?? "すべて"}</output>
    </AppShiftsOverviewView>
  );
}

export const SingleShop: Story = {
  render: () => <FilterPreview singleShop />,
};

export const ShopFilterBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <FilterPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "店舗で絞り込む（現在：すべて）" }));
    const body = within(document.body);
    await userEvent.click(await body.findByRole("menuitemradio", { name: "もて" }));
    await expect(canvas.getByText("選択中：shop-annex")).toBeInTheDocument();
  },
};

function ErrorRetryPreview() {
  const [retried, setRetried] = useState(false);
  return retried ? (
    <output>再読み込みを開始しました</output>
  ) : (
    <AppShiftsPageStateView state={{ kind: "error" }} onRetry={() => setRetried(true)} />
  );
}

export const QueryErrorRetryBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ErrorRetryPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "再試行する" }));
    await expect(await canvas.findByText("再読み込みを開始しました")).toBeInTheDocument();
  },
};

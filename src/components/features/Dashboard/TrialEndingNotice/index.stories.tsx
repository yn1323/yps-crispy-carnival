import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { TrialEndingNotice, TrialEndingNoticeView } from "./index";
import { buildTrialEndingNoticeViewModel, type TrialEndingNoticeData } from "./script";

const DAY_MS = 24 * 60 * 60 * 1000;
// VRTの見た目を日付に依存させないよう、固定の現在時刻からview modelを作る。
const TRIAL_ENDS_AT = Date.UTC(2026, 9, 31, 15, 0, 0);
const ORGANIZATION_ID = "organization-trial-story";
const DISMISSAL_STORAGE_PREFIX = "shiftori:trial-ending-notice-dismissed";

const overLimit: TrialEndingNoticeData["freeLimitStatus"] = {
  kind: "overLimit",
  violations: [
    { kind: "people", current: 12 },
    { kind: "shops", current: 2 },
  ],
};

const viewModelAt = (freeLimitStatus: TrialEndingNoticeData["freeLimitStatus"], remainingMs: number) => {
  const viewModel = buildTrialEndingNoticeViewModel(
    { trialEndsAt: TRIAL_ENDS_AT, freeLimitStatus },
    TRIAL_ENDS_AT - remainingMs,
  );
  if (!viewModel) throw new Error("Story view model is outside the notice period");
  return viewModel;
};

const clearDismissals = () => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(DISMISSAL_STORAGE_PREFIX)) localStorage.removeItem(key);
  }
};

const meta = {
  title: "Features/Dashboard/TrialEndingNotice",
  component: TrialEndingNoticeView,
  tags: ["vrt-mobile2"],
  parameters: { layout: "fullscreen" },
  args: {
    viewModel: viewModelAt(overLimit, 10 * DAY_MS),
    onOpenBillingSettings: () => {},
    onDismiss: () => {},
  },
  decorators: [
    (Story) => (
      <Box minH="100vh" bg="gray.50" p={{ base: 4, md: 8 }}>
        <Box maxW="960px" mx="auto">
          <Story />
        </Box>
      </Box>
    ),
  ],
} satisfies Meta<typeof TrialEndingNoticeView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OverLimitTwoWeeks: Story = {};

export const OverLimitOneWeek: Story = {
  args: { viewModel: viewModelAt(overLimit, 7 * DAY_MS) },
};

export const OverLimitLastDay: Story = {
  args: { viewModel: viewModelAt(overLimit, DAY_MS / 2) },
};

export const WithinFreeLimits: Story = {
  args: { viewModel: viewModelAt({ kind: "withinLimits" }, 3 * DAY_MS) },
};

export const UsageUnknown: Story = {
  args: { viewModel: viewModelAt({ kind: "unknown" }, 3 * DAY_MS) },
};

let billingSettingsOpenCount = 0;

/** 残り14日の段階は「後で確認する」で閉じると、同じ組織の同じTrialでは次の段階まで表示しない。 */
export const DismissTwoWeeksNotice: Story = {
  parameters: { screenshot: { skip: true } },
  beforeEach: () => {
    clearDismissals();
    billingSettingsOpenCount = 0;
    return clearDismissals;
  },
  render: () => {
    const notice = { trialEndsAt: Date.now() + 10 * DAY_MS, freeLimitStatus: overLimit };
    return (
      <>
        <TrialEndingNotice
          notice={notice}
          organizationId={ORGANIZATION_ID}
          onOpenBillingSettings={() => {
            billingSettingsOpenCount += 1;
          }}
        />
        <Box>
          <TrialEndingNotice
            notice={notice}
            organizationId={`${ORGANIZATION_ID}-other`}
            onOpenBillingSettings={() => {}}
          />
        </Box>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notices = await canvas.findAllByRole("region", { name: "無料トライアル終了の案内" });
    await expect(notices).toHaveLength(2);

    await userEvent.click(within(notices[0]).getByRole("button", { name: "プランを選ぶ" }));
    await expect(billingSettingsOpenCount).toBe(1);

    await userEvent.click(within(notices[0]).getByRole("button", { name: "後で確認する" }));
    await waitFor(() => expect(canvas.getAllByRole("region", { name: "無料トライアル終了の案内" })).toHaveLength(1));
    await expect(
      Object.keys(localStorage).filter((key) => key.startsWith(`${DISMISSAL_STORAGE_PREFIX}:${ORGANIZATION_ID}:`)),
    ).toHaveLength(1);
  },
};

/** 最終日の案内は閉じられない。 */
export const LastDayCannotBeDismissed: Story = {
  parameters: { screenshot: { skip: true } },
  beforeEach: clearDismissals,
  render: () => (
    <TrialEndingNotice
      notice={{ trialEndsAt: Date.now() + DAY_MS / 2, freeLimitStatus: overLimit }}
      organizationId={ORGANIZATION_ID}
      onOpenBillingSettings={() => {}}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notice = await canvas.findByRole("region", { name: "無料トライアル終了の案内" });
    await expect(within(notice).getByText("無料トライアルは今日で終わります")).toBeVisible();
    await expect(within(notice).queryByRole("button", { name: "後で確認する" })).not.toBeInTheDocument();
    await expect(within(notice).getByRole("button", { name: "プランを選ぶ" })).toBeVisible();
  },
};

/** 表示期間より前の組織には何も表示しない。 */
export const BeforeNoticePeriod: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => (
    <TrialEndingNotice
      notice={{ trialEndsAt: Date.now() + 30 * DAY_MS, freeLimitStatus: overLimit }}
      organizationId={ORGANIZATION_ID}
      onOpenBillingSettings={() => {}}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("region", { name: "無料トライアル終了の案内" }),
    ).not.toBeInTheDocument();
  },
};

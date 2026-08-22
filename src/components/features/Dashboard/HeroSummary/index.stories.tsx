import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import dayjs from "dayjs";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ActionInboxView,
  buildNotificationFailureActionInboxItem,
  buildStaffRegistrationActionInboxItem,
} from "@/src/components/features/ActionInbox";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { HeroSummary, HeroSummarySkeleton, WelcomeHero } from ".";

const meta = {
  title: "Features/Dashboard/HeroSummary",
  component: HeroSummary,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <Stack maxW="1024px" mx="auto" w="full">
        <Story />
      </Stack>
    ),
  ],
} satisfies Meta<typeof HeroSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

const today = dayjs().format("YYYY-MM-DD");
const inDays = (n: number) => dayjs().add(n, "day").format("YYYY-MM-DD");

const id = (s: string) => s as unknown as Id<"recruitments">;

const make = (over: Partial<Recruitment>): Recruitment => ({
  _id: id("base"),
  createdAt: Date.now(),
  periodStart: inDays(7),
  periodEnd: inDays(14),
  deadline: inDays(7),
  shopClosedDates: [],
  status: "open",
  confirmedAt: null,
  responseCount: 5,
  totalStaffCount: 10,
  ...over,
});

const past = make({ _id: id("past"), deadline: inDays(-3), responseCount: 8, totalStaffCount: 10 });
const dueToday = make({ _id: id("today"), deadline: today, responseCount: 4, totalStaffCount: 10 });
const dueSoon = make({ _id: id("soon"), deadline: inDays(2), responseCount: 2, totalStaffCount: 5 });
const calm = make({ _id: id("calm"), deadline: inDays(10), responseCount: 0, totalStaffCount: 1 });
const zeroTotal = make({ _id: id("zero-total"), deadline: inDays(10), responseCount: 0, totalStaffCount: 0 });
const confirmed = make({ _id: id("conf"), status: "confirmed", deadline: inDays(-30), responseCount: 10 });

const NOOP = {
  onOpenShiftBoard: () => {},
  onCreateRecruitment: () => {},
};

const baseArgs = {
  ...NOOP,
};
const allTasksArgs = {
  ...baseArgs,
  recruitments: [past, confirmed],
  notificationFailures: {
    count: 1,
    content: (
      <ActionInboxView
        hideEmpty
        itemVariant="list"
        items={[
          buildNotificationFailureActionInboxItem(
            {
              id: "notificationFailure:story",
              staffName: "佐藤 真由美",
              shopName: "渋谷店",
              notificationKindLabel: "シフト募集通知",
              channel: "email",
              lastFailedAt: new Date("2026-08-20T09:00:00+09:00").getTime(),
              canRetry: true,
              canResolve: true,
            },
            { retry: () => {}, resolve: () => {} },
          ),
        ]}
      />
    ),
  },
  staffRegistrationRequest: {
    count: 1,
    content: (
      <ActionInboxView
        hideEmpty
        itemVariant="list"
        items={[
          buildStaffRegistrationActionInboxItem(
            {
              id: "staffRegistration:story",
              applicantName: "鈴木 花子",
              shopName: "渋谷店",
              createdAt: new Date("2026-08-20T08:30:00+09:00").getTime(),
              canApprove: true,
              canReject: true,
            },
            { approve: () => {}, reject: () => {} },
          ),
        ]}
      />
    ),
  },
};

export const AfterDeadline: Story = {
  args: {
    ...baseArgs,
    recruitments: [past, confirmed],
  },
};

export const DueToday: Story = {
  args: {
    ...baseArgs,
    recruitments: [dueToday, confirmed],
  },
};

export const DueSoon: Story = {
  args: {
    ...baseArgs,
    recruitments: [dueSoon, confirmed],
  },
};

export const WaitingForSubmission: Story = {
  args: {
    ...baseArgs,
    recruitments: [calm, confirmed],
  },
};

export const WithNotificationFailures: Story = {
  args: {
    ...allTasksArgs,
    recruitments: [calm, confirmed],
    staffRegistrationRequest: undefined,
  },
};

export const AllTasksDesktop: Story = {
  args: allTasksArgs,
};

export const AllTasksMobile: Story = {
  tags: ["vrt-mobile1"],
  args: allTasksArgs,
  decorators: [
    (Story) => (
      <Stack maxW="390px" mx="auto" w="full">
        <Story />
      </Stack>
    ),
  ],
};

export const LastActionItemExitBehavior: Story = {
  args: {
    ...baseArgs,
    recruitments: [],
  },
  parameters: { screenshot: { skip: true } },
  render: () => <LastActionItemExitPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const summaryTrigger = canvas.getByRole("button", { name: /スタッフ登録申請が1件/ });
    await userEvent.click(summaryTrigger);
    const items = await canvas.findByRole("region", { name: "スタッフ登録申請" });
    await userEvent.click(within(items).getByRole("button", { name: "承認する" }));

    const exitingItem = within(items).getByRole("article");
    await waitFor(() => expect(exitingItem).toHaveAttribute("data-state", "exiting"));
    await expect(canvas.getByRole("button", { name: /スタッフ登録申請が1件/ })).toBeVisible();
    await expect(exitingItem).toBeInTheDocument();
    await waitFor(() =>
      expect(canvas.queryByRole("button", { name: /スタッフ登録申請が1件/ })).not.toBeInTheDocument(),
    );
  },
};

function LastActionItemExitPreview() {
  const [isPresent, setIsPresent] = useState(true);
  const [visibleItemCount, setVisibleItemCount] = useState(1);
  const item = buildStaffRegistrationActionInboxItem(
    {
      id: "staffRegistration:last-story-item",
      applicantName: "鈴木 花子",
      shopName: "渋谷店",
      createdAt: new Date("2026-08-20T08:30:00+09:00").getTime(),
      canApprove: true,
      canReject: true,
    },
    { approve: () => setIsPresent(false), reject: () => undefined },
  );

  return (
    <HeroSummary
      {...NOOP}
      recruitments={[]}
      isRecruitmentTaskAvailable={false}
      staffRegistrationRequest={
        visibleItemCount > 0
          ? {
              count: visibleItemCount,
              content: (
                <ActionInboxView
                  items={isPresent ? [item] : []}
                  ariaLabel="スタッフ登録申請"
                  hideEmpty
                  itemVariant="list"
                  onVisibleItemCountChange={setVisibleItemCount}
                />
              ),
            }
          : undefined
      }
    />
  );
}

export const NoStaffRegistered: Story = {
  args: {
    ...baseArgs,
    recruitments: [zeroTotal, confirmed],
  },
};

export const NoOpenRecruitment: Story = {
  args: {
    ...baseArgs,
    recruitments: [confirmed],
  },
};

export const Loading: Story = {
  args: {
    ...baseArgs,
    recruitments: [],
  },
  render: () => <HeroSummarySkeleton />,
};

export const MetaItemsMobile: Story = {
  tags: ["vrt-mobile1"],
  args: {
    ...baseArgs,
    recruitments: [dueSoon, confirmed],
  },
  decorators: [
    (Story) => (
      <Stack maxW="360px" mx="auto" w="full">
        <Story />
      </Stack>
    ),
  ],
};

export const WelcomeDesktop: Story = {
  args: {
    ...baseArgs,
    recruitments: [],
  },
  render: () => <WelcomeHero onSetupClick={() => {}} />,
};

export const WelcomeMobile: Story = {
  tags: ["vrt-mobile1"],
  args: {
    ...baseArgs,
    recruitments: [],
  },
  decorators: [
    (Story) => (
      <Stack maxW="360px" mx="auto" w="full">
        <Story />
      </Stack>
    ),
  ],
  render: () => <WelcomeHero onSetupClick={() => {}} />,
};

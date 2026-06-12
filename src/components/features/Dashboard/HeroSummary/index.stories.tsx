import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import dayjs from "dayjs";
import type { Id } from "@/convex/_generated/dataModel";
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

const SHOP = {
  name: "居酒屋たなか",
};
const today = dayjs().format("YYYY-MM-DD");
const inDays = (n: number) => dayjs().add(n, "day").format("YYYY-MM-DD");

const id = (s: string) => s as unknown as Id<"recruitments">;

const make = (over: Partial<Recruitment>): Recruitment => ({
  _id: id("base"),
  periodStart: "2026-05-01",
  periodEnd: "2026-05-07",
  deadline: inDays(7),
  shopClosedDates: [],
  status: "open",
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
  onEditClick: () => {},
  onOpenShiftBoard: () => {},
  onCreateRecruitment: () => {},
};

const baseArgs = {
  shop: SHOP,
  ...NOOP,
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

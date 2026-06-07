import { Stack, Text } from "@chakra-ui/react";
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

export const Variants: Story = {
  args: {
    shop: SHOP,
    recruitments: [past],
    ...NOOP,
  },
  render: () => (
    <Stack gap={6} maxW="1024px" mx="auto" w="full">
      <Section label="締切後・調整待ち">
        <HeroSummary shop={SHOP} recruitments={[past, confirmed]} {...NOOP} />
      </Section>
      <Section label="今日が締切">
        <HeroSummary shop={SHOP} recruitments={[dueToday, confirmed]} {...NOOP} />
      </Section>
      <Section label="締切が近い (3日以内)">
        <HeroSummary shop={SHOP} recruitments={[dueSoon, confirmed]} {...NOOP} />
      </Section>
      <Section label="提出待ち (締切まで余裕あり)">
        <HeroSummary shop={SHOP} recruitments={[calm, confirmed]} {...NOOP} />
      </Section>
      <Section label="スタッフ未登録">
        <HeroSummary shop={SHOP} recruitments={[zeroTotal, confirmed]} {...NOOP} />
      </Section>
      <Section label="やることなし (open募集ゼロ)">
        <HeroSummary shop={SHOP} recruitments={[confirmed]} {...NOOP} />
      </Section>
      <Section label="初回ログイン時">
        <WelcomeHero onSetupClick={() => {}} />
      </Section>
      <Section label="読み込み中">
        <HeroSummarySkeleton />
      </Section>
    </Stack>
  ),
};

export const MetaItemsMobile: Story = {
  args: {
    shop: SHOP,
    recruitments: [dueSoon, confirmed],
    ...NOOP,
  },
  render: () => (
    <Stack maxW="360px" mx="auto" w="full">
      <HeroSummary shop={SHOP} recruitments={[dueSoon, confirmed]} {...NOOP} />
    </Stack>
  ),
};

export const WelcomeDesktop: Story = {
  args: {
    shop: SHOP,
    recruitments: [],
    ...NOOP,
  },
  render: () => (
    <Stack maxW="1024px" mx="auto" w="full">
      <WelcomeHero onSetupClick={() => {}} />
    </Stack>
  ),
};

export const WelcomeMobile: Story = {
  args: {
    shop: SHOP,
    recruitments: [],
    ...NOOP,
  },
  render: () => (
    <Stack maxW="360px" mx="auto" w="full">
      <WelcomeHero onSetupClick={() => {}} />
    </Stack>
  ),
};

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Stack gap={2}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" letterSpacing="0.08em" textTransform="uppercase">
      {label}
    </Text>
    {children}
  </Stack>
);

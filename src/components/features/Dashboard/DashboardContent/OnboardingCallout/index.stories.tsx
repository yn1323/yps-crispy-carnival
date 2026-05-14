import { Box, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { Recruitment, Staff } from "../../types";
import { type DashboardOnboardingStage, deriveDashboardOnboardingState } from "./deriveDashboardOnboardingState";
import { OnboardingCallout } from "./index";

const managerOnly = [
  {
    _id: "staff-manager",
    name: "シフト担当者",
    email: "manager@example.com",
    isManager: true,
    isLineLinked: false,
    isLineFollowing: false,
  },
] as unknown as Staff[];
const baseRecruitment = {
  _id: "rec-1",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-07",
  deadline: "2026-05-28",
  status: "open",
  responseCount: 0,
} as unknown as Recruitment;

type StoryProps = {
  recruitments: Recruitment[];
  staffs: Staff[];
  reviewedRecruitmentIds?: string[];
};

const variants = [
  {
    label: "募集作成前",
    props: {
      recruitments: [],
      staffs: managerOnly,
    },
  },
  {
    label: "自分で提出する",
    props: {
      recruitments: [baseRecruitment],
      staffs: managerOnly,
    },
  },
  {
    label: "提出確認",
    props: {
      recruitments: [{ ...baseRecruitment, responseCount: 1 } as Recruitment],
      staffs: managerOnly,
    },
  },
  {
    label: "スタッフ追加",
    props: {
      recruitments: [{ ...baseRecruitment, responseCount: 1 } as Recruitment],
      staffs: managerOnly,
      reviewedRecruitmentIds: ["rec-1"],
    },
  },
] satisfies Array<{ label: string; props: StoryProps }>;

const OnboardingCalloutStory = ({ recruitments, staffs, reviewedRecruitmentIds = [] }: StoryProps) => {
  const [dismissedStages, setDismissedStages] = useState<DashboardOnboardingStage[]>([]);
  const state = deriveDashboardOnboardingState({ recruitments, staffs, dismissedStages, reviewedRecruitmentIds });

  if (state.kind !== "visible") return null;
  return (
    <OnboardingCallout
      state={state}
      onDismiss={(stage) => setDismissedStages((current) => (current.includes(stage) ? current : [...current, stage]))}
    />
  );
};

const meta = {
  title: "Features/Dashboard/OnboardingCallout",
  component: OnboardingCalloutStory,
  parameters: { layout: "fullscreen" },
  args: {
    recruitments: [],
    staffs: managerOnly,
  },
} satisfies Meta<typeof OnboardingCalloutStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  args: {
    recruitments: [],
    staffs: managerOnly,
  },
  render: () => (
    <Box minH="100vh" bg="white" p={{ base: 4, md: 8 }}>
      <Stack maxW="960px" mx="auto" gap={{ base: 5, md: 6 }}>
        {variants.map((variant) => (
          <Stack key={variant.label} gap={2}>
            <Text fontSize="sm" fontWeight="bold" color="gray.600">
              {variant.label}
            </Text>
            <OnboardingCalloutStory {...variant.props} />
          </Stack>
        ))}
      </Stack>
    </Box>
  ),
};

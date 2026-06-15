import { Box, Stack } from "@chakra-ui/react";
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
  totalStaffCount: 1,
} as unknown as Recruitment;

type StoryProps = {
  recruitments: Recruitment[];
  staffs: Staff[];
  reviewedRecruitmentIds?: string[];
};

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
  decorators: [
    (Story) => (
      <Box minH="100vh" bg="white" p={{ base: 4, md: 8 }}>
        <Stack maxW="960px" mx="auto">
          <Story />
        </Stack>
      </Box>
    ),
  ],
} satisfies Meta<typeof OnboardingCalloutStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BeforeRecruitmentCreated: Story = {};

export const SubmitYourself: Story = {
  args: {
    recruitments: [baseRecruitment],
  },
};

export const ReviewSubmission: Story = {
  args: {
    recruitments: [{ ...baseRecruitment, responseCount: 1 } as Recruitment],
  },
};

export const AddStaff: Story = {
  args: {
    recruitments: [{ ...baseRecruitment, responseCount: 1 } as Recruitment],
    reviewedRecruitmentIds: ["rec-1"],
  },
};

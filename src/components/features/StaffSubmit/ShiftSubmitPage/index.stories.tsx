import type { Meta, StoryObj } from "@storybook/react-vite";
import type { SubmissionData } from "../SubmitFormView";
import { ShiftSubmitPage } from "./index";

const baseData: SubmissionData = {
  shopName: "居酒屋さくら",
  staffName: "田中太郎",
  periodStart: "2026-04-07",
  periodEnd: "2026-04-13",
  deadline: "2026-04-04",
  isBeforeDeadline: true,
  hasSubmitted: false,
  existingRequests: [],
  legalConsentRequired: false,
  legalDocuments: {
    terms: {
      title: "スタッフ向け利用規約",
      documentVersion: "staff-terms-doc-2026-05-09",
      requiredConsentVersion: "staff-terms-consent-2026-05-09",
      path: "/terms/staff",
    },
    privacy: {
      title: "スタッフ向けプライバシーポリシー",
      documentVersion: "staff-privacy-doc-2026-05-09",
      requiredConsentVersion: "staff-privacy-consent-2026-05-09",
      path: "/privacy/staff",
    },
  },
  timeRange: { startTime: "09:00", endTime: "22:00" },
  previousWeeklyPattern: null,
};

const meta = {
  title: "features/StaffSubmit/ShiftSubmitPage",
  component: ShiftSubmitPage,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof ShiftSubmitPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = async () => {};

export const StateA_Unsubmitted: Story = {
  args: {
    data: baseData,
    onSubmit: noop,
  },
};

export const StateB_Submitted: Story = {
  args: {
    onSubmit: noop,
    data: {
      ...baseData,
      hasSubmitted: true,
      existingRequests: [
        { date: "2026-04-07", startTime: "09:00", endTime: "18:00" },
        { date: "2026-04-09", startTime: "10:00", endTime: "15:00" },
        { date: "2026-04-11", startTime: "09:00", endTime: "22:00" },
      ],
    },
  },
};

export const StateB_PreviousPatternAvailable: Story = {
  args: {
    onSubmit: noop,
    data: {
      ...baseData,
      previousWeeklyPattern: {
        sourceWeekStart: "2026-03-30",
        days: [
          { weekday: 1, startTime: "09:00", endTime: "17:00" },
          { weekday: 3, startTime: "10:00", endTime: "18:00" },
          { weekday: 5, startTime: "12:00", endTime: "21:00" },
        ],
      },
    },
  },
};

export const StateC_SubmittedExpired: Story = {
  args: {
    onSubmit: noop,
    data: {
      ...baseData,
      isBeforeDeadline: false,
      hasSubmitted: true,
      existingRequests: [
        { date: "2026-04-07", startTime: "09:00", endTime: "18:00" },
        { date: "2026-04-08", startTime: "09:00", endTime: "18:00" },
        { date: "2026-04-09", startTime: "10:00", endTime: "15:00" },
        { date: "2026-04-11", startTime: "09:00", endTime: "22:00" },
      ],
    },
  },
};

export const StateD_Expired: Story = {
  args: {
    onSubmit: noop,
    data: {
      ...baseData,
      isBeforeDeadline: false,
      hasSubmitted: false,
    },
  },
};

export const StateE_LegalConsentRequired: Story = {
  args: {
    onSubmit: noop,
    data: {
      ...baseData,
      legalConsentRequired: true,
    },
  },
};

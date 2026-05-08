import type { Meta, StoryObj } from "@storybook/react-vite";
import type { SubmissionData } from "./index";
import { SubmitFormView } from "./index";

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
};

const submittedData: SubmissionData = {
  ...baseData,
  hasSubmitted: true,
  existingRequests: [
    { date: "2026-04-07", startTime: "09:00", endTime: "18:00" },
    { date: "2026-04-09", startTime: "10:00", endTime: "15:00" },
    { date: "2026-04-11", startTime: "09:00", endTime: "22:00" },
  ],
};

const meta = {
  title: "features/StaffSubmit/SubmitFormView",
  component: SubmitFormView,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof SubmitFormView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unsubmitted: Story = {
  args: {
    data: baseData,
    onSubmit: async () => {},
  },
};

export const Submitted: Story = {
  args: {
    data: submittedData,
    onSubmit: async () => {},
  },
};

export const LegalConsentRequired: Story = {
  args: {
    data: { ...baseData, legalConsentRequired: true },
    onSubmit: async () => {},
  },
};

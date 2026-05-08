import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { StaffLegalConsentPage, type StaffLegalConsentPageData } from "./index";

const documents = {
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
};

const okData: StaffLegalConsentPageData = {
  status: "ok",
  staffName: "田中 太郎",
  shopName: "居酒屋さくら",
  expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  documents,
};

const meta = {
  title: "features/StaffLegalConsent/ConsentPage",
  component: StaffLegalConsentPage,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <StaffLayout shopName="居酒屋さくら">
        <Story />
      </StaffLayout>
    ),
  ],
} satisfies Meta<typeof StaffLegalConsentPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: okData,
    onAccept: async () => {},
  },
};

export const Accepted: Story = {
  args: {
    data: {
      status: "accepted",
      staffName: "田中 太郎",
      shopName: "居酒屋さくら",
      documents,
    },
  },
};

export const Expired: Story = {
  args: {
    data: {
      status: "expired",
      documents,
    },
  },
};

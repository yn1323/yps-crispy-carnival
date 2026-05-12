import { Box, Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { StaffLegalConsentPageData } from "./index";
import { LegalConsentPanel } from "./LegalConsentPanel";

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

const acceptedData: StaffLegalConsentPageData = {
  status: "accepted",
  staffName: "田中 太郎",
  shopName: "居酒屋さくら",
  documents,
};

const expiredData: StaffLegalConsentPageData = {
  status: "expired",
  documents,
};

const meta = {
  title: "features/StaffLegalConsent/LegalConsentPanel",
  component: LegalConsentPanel,
  parameters: {
    layout: "fullscreen",
    chromatic: { disableSnapshot: true },
  },
  args: {
    data: okData,
    checked: false,
    error: null,
    isSubmitting: false,
    onCheckedChange: () => {},
    onAccept: async () => {},
  },
  decorators: [
    (Story) => (
      <Box bg="teal.50" minH="100dvh" px={{ base: 4, md: 8 }} py={{ base: 5, md: 8 }}>
        <Box maxW="760px" mx="auto">
          <Story />
        </Box>
      </Box>
    ),
  ],
} satisfies Meta<typeof LegalConsentPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <InteractivePanel data={okData} />,
};

export const Variants: Story = {
  render: () => (
    <Stack gap={5}>
      <InteractivePanel data={okData} />
      <LegalConsentPanel
        data={acceptedData}
        checked={false}
        error={null}
        isSubmitting={false}
        onCheckedChange={() => {}}
        onAccept={async () => {}}
      />
      <LegalConsentPanel
        data={expiredData}
        checked={false}
        error={null}
        isSubmitting={false}
        onCheckedChange={() => {}}
        onAccept={async () => {}}
      />
    </Stack>
  ),
};

function InteractivePanel({ data }: { data: StaffLegalConsentPageData }) {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <LegalConsentPanel
      data={data}
      checked={checked}
      error={error}
      isSubmitting={false}
      onCheckedChange={(nextChecked) => {
        setChecked(nextChecked);
        if (nextChecked) setError(null);
      }}
      onAccept={async () => {
        if (!checked) {
          setError("利用規約とプライバシーポリシーに同意してください");
        }
      }}
    />
  );
}

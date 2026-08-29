import type { Meta, StoryObj } from "@storybook/react-vite";
import { OrganizationPaymentFailureAlert } from ".";

const meta = {
  title: "Shared/OrganizationPaymentFailureAlert",
  component: OrganizationPaymentFailureAlert,
  parameters: { layout: "padded" },
  args: {
    terminationPending: false,
    onStartPaidPlan: () => {},
  },
} satisfies Meta<typeof OrganizationPaymentFailureAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveFree: Story = {
  name: "Free確定後・再契約可能",
};

export const TerminationPending: Story = {
  name: "支払い終了処理中",
  args: { terminationPending: true },
};

export const Mobile: Story = {
  name: "Free確定後・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const MobileTerminationPending: Story = {
  name: "支払い終了処理中・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: { terminationPending: true },
};

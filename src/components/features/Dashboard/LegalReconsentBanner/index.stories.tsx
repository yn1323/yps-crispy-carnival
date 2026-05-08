import type { Meta, StoryObj } from "@storybook/react-vite";
import { LegalReconsentBanner } from "./index";

const documents = {
  terms: { title: "管理ユーザー向け利用規約", path: "/terms/manager" },
  privacy: { title: "管理ユーザー向けプライバシーポリシー", path: "/privacy/manager" },
};

const meta = {
  title: "Features/Dashboard/LegalReconsentBanner",
  component: LegalReconsentBanner,
  args: {
    documents,
    onAccept: async () => {},
  },
} satisfies Meta<typeof LegalReconsentBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Submitting: Story = {
  args: {
    isSubmitting: true,
  },
};

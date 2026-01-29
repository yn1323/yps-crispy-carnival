import type { Meta, StoryObj } from "@storybook/react-vite";
import { SetupWizard } from "./index";

const meta = {
  title: "features/Shift/StaffingMatrix/SetupWizard",
  component: SetupWizard,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof SetupWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

const positions = [
  { _id: "pos_1", name: "ホール" },
  { _id: "pos_2", name: "キッチン" },
  { _id: "pos_3", name: "その他" },
];

export const Basic: Story = {
  args: {
    openTime: "09:00",
    closeTime: "22:00",
    positions,
    onSave: (patterns, aiInput) => {
      console.log("Saved:", patterns, aiInput);
    },
    onCancel: () => {
      console.log("Cancelled");
    },
  },
};

export const ShortHours: Story = {
  args: {
    openTime: "11:00",
    closeTime: "15:00",
    positions: [
      { _id: "pos_1", name: "ホール" },
      { _id: "pos_2", name: "キッチン" },
    ],
    onSave: (patterns, aiInput) => {
      console.log("Saved:", patterns, aiInput);
    },
    onCancel: () => {
      console.log("Cancelled");
    },
  },
};

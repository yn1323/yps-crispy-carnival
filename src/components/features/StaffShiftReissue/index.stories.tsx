import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffShiftReissueView } from ".";

const meta = {
  title: "Features/StaffShiftReissue",
  component: StaffShiftReissueView,
  parameters: { layout: "fullscreen" },
  args: {
    periodLabel: "8/3(月) 〜 8/9(日)",
    isDone: false,
    isSubmitting: false,
    onSubmit: () => {},
  },
} satisfies Meta<typeof StaffShiftReissueView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Form: Story = {};

export const FormMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const Completed: Story = {
  args: { isDone: true },
};

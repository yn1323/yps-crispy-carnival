import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReissueForm } from "./index";

const meta = {
  title: "features/StaffView/ReissueForm",
  component: ReissueForm,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReissueForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    onSubmit: () => {},
    isSubmitting: false,
  },
};

export const Submitting: Story = {
  args: {
    onSubmit: () => {},
    isSubmitting: true,
  },
};

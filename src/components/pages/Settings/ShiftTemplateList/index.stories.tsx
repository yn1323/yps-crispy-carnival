import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftTemplateList } from ".";

const meta = {
  title: "Pages/Settings/ShiftTemplateList",
  component: ShiftTemplateList,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftTemplateList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    storeId: "1",
  },
};

export const Empty: Story = {
  args: {
    storeId: "3",
  },
};

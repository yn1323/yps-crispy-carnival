import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftTemplateForm } from ".";

const meta = {
  title: "Pages/Settings/ShiftTemplateForm",
  component: ShiftTemplateForm,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftTemplateForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Add: Story = {
  args: {
    mode: "add",
    storeName: "本店",
  },
};

export const Edit: Story = {
  args: {
    mode: "edit",
    storeName: "本店",
    template: {
      id: "1",
      name: "早番",
      daysOfWeek: ["月", "火", "水", "木", "金"],
      startTime: "09:00",
      endTime: "17:00",
    },
  },
};

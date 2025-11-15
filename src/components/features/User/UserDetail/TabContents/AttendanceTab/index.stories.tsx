import type { Meta, StoryObj } from "@storybook/react-vite";
import { AttendanceTab } from ".";

const meta: Meta<typeof AttendanceTab> = {
  component: AttendanceTab,
  title: "Features/User/UserDetail/TabContents/AttendanceTab",
};

export default meta;

type Story = StoryObj<typeof AttendanceTab>;

export const Basic: Story = {};

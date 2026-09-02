import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffShiftViewUnavailable } from ".";

const meta = {
  title: "Pages/StaffShiftViewUnavailable",
  component: StaffShiftViewUnavailable,
  parameters: { layout: "fullscreen" },
  args: { recruitmentId: "synthetic-recruitment-id" },
} satisfies Meta<typeof StaffShiftViewUnavailable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithReissue: Story = {};

export const WithoutReissue: Story = {
  args: { recruitmentId: null },
};

export const WithoutReissueMobile: Story = {
  args: { recruitmentId: null },
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

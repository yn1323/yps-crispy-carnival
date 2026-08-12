import type { Meta, StoryObj } from "@storybook/react-vite";
import { DemoShiftBoardRoutePage } from ".";

const meta = {
  title: "Pages/DemoShiftBoardRoutePage",
  component: DemoShiftBoardRoutePage,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof DemoShiftBoardRoutePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  parameters: {
    vrt: { releaseFixedHeader: true },
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    vrt: { releaseFixedHeader: true },
  },
};

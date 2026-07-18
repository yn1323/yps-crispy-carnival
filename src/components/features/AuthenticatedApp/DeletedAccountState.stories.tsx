import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeletedAccountState } from "./DeletedAccountState";

const meta = {
  title: "Features/AuthenticatedApp/DeletedAccountState",
  component: DeletedAccountState,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DeletedAccountState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { withDummyRouter } from "../../../../.storybook/withDummyRouter";
import { BottomMenu } from "./index";

const meta = {
  title: "templates/BottomMenu",
  component: BottomMenu,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [withDummyRouter("/")],
} satisfies Meta<typeof BottomMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

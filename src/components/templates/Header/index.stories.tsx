import type { Meta, StoryObj } from "@storybook/react-vite";
import { Header } from "./index";

const meta = {
  title: "templates/Header",
  component: Header,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

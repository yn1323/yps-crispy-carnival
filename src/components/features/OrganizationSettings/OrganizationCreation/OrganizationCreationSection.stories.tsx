import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { OrganizationCreationSection } from "./OrganizationCreationSection";

const meta = {
  id: "features-organizationsettings-organizationcreationsection",
  title: "Features/OrganizationSettings/2. セクション/新しいグループ",
  component: OrganizationCreationSection,
  parameters: { layout: "padded" },
  args: {
    canCreate: true,
    onCreate: fn(),
  },
} satisfies Meta<typeof OrganizationCreationSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Creatable: Story = { name: "作成できる" };

export const LimitReached: Story = {
  name: "上限に達している",
  args: {
    canCreate: false,
    disabledReason: "作成できるグループは3つまでです。\n使っていないグループを削除すると、また作成できます。",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "新しいグループを作る" });
    await expect(button).toBeDisabled();
    await userEvent.click(button, { pointerEventsCheck: 0 });
    await expect(args.onCreate).not.toHaveBeenCalled();
  },
};

export const MobileCreatable: Story = {
  name: "作成できる・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

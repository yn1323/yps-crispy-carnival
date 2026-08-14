import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { DesktopAppPrimaryNavigation, MobileAppPrimaryNavigation } from ".";

const ORGANIZATION_ID = "organizations_story";

const meta = {
  title: "Features/AuthenticatedApp/AppPrimaryNavigation",
  component: DesktopAppPrimaryNavigation,
  args: { activeKey: "staff", activeOrganizationId: ORGANIZATION_ID },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DesktopAppPrimaryNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const navigation = within(canvasElement).getByRole("navigation", { name: "メインメニュー" });
    const links = within(navigation).getAllByRole("link");

    await expect(links).toHaveLength(5);
    await expect(within(navigation).getByRole("link", { name: "スタッフ" })).toHaveAttribute("aria-current", "page");
    await expect(within(navigation).getByRole("link", { name: "シフト" })).toHaveAttribute(
      "href",
      `/app/shifts?org=${ORGANIZATION_ID}`,
    );
    await expect(within(navigation).getByRole("link", { name: "対応" })).toBeVisible();
    await expect(within(navigation).queryByText("4")).not.toBeInTheDocument();
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: (args) => <MobileAppPrimaryNavigation {...args} />,
  play: Desktop.play,
};

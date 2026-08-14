import { Box, Heading } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { AppOrganizationSwitcher } from "@/src/components/features/AuthenticatedApp";
import { AuthenticatedAppShell } from ".";

const ORGANIZATION_ID = "organizations_story" as Id<"organizations">;
const SECOND_ORGANIZATION_ID = "organizations_story_second" as Id<"organizations">;

const meta = {
  title: "Templates/AuthenticatedAppShell",
  component: AuthenticatedAppShell,
  args: {
    activeKey: "home",
    activeOrganizationId: ORGANIZATION_ID,
    organizationSwitcher: (
      <AppOrganizationSwitcher
        activeOrganizationId={ORGANIZATION_ID}
        activeOrganizationName="すーぱーかんぱにー"
        options={[
          { id: ORGANIZATION_ID, name: "すーぱーかんぱにー", memberStatus: "active" },
          { id: SECOND_ORGANIZATION_ID, name: "別の組織", memberStatus: "readOnly" },
        ]}
        onSelect={() => {}}
      />
    ),
    featureRequest: {
      expectedOrganizationId: ORGANIZATION_ID,
      scope: { kind: "organization" },
    },
    children: null,
  },
  render: (args) => (
    <AuthenticatedAppShell {...args}>
      <Box p={6}>
        <Heading>ホーム</Heading>
      </Box>
    </AuthenticatedAppShell>
  ),
  parameters: { layout: "fullscreen", vrt: { releaseFixedHeader: true } },
} satisfies Meta<typeof AuthenticatedAppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OrganizationScoped: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "ホームへ" })).toHaveAttribute(
      "href",
      `/app/home?org=${ORGANIZATION_ID}`,
    );
    await expect(canvas.getByRole("link", { name: "スタッフ" })).toHaveAttribute(
      "href",
      `/app/staff?org=${ORGANIZATION_ID}`,
    );
    await expect(canvas.getByText("LINEで使えるシフト管理")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "組織を切り替える（現在：すーぱーかんぱにー）" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "要望を送る" })).toBeVisible();
  },
};

export const AccountWithoutOrganizationAction: Story = {
  args: {
    activeKey: null,
    activeOrganizationId: undefined,
    organizationSwitcher: undefined,
    featureRequest: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "ホームへ" })).toHaveAttribute("href", "/app/home");
    await expect(canvas.queryByRole("button", { name: /組織を切り替える/ })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "要望を送る" })).not.toBeInTheDocument();
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const NarrowMobileWithAllHeaderActions: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: OrganizationScoped.play,
};

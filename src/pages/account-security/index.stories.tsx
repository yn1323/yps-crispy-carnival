import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { AuthenticatedAppShell } from "@/src/components/templates/AuthenticatedAppShell";
import { AccountSecurityPage } from ".";

const ORGANIZATION_ID = "organizations_account_story" as Id<"organizations">;

const meta = {
  title: "Pages/AccountSecurity/Composition",
  component: AccountSecurityPage,
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
  render: (args) => (
    <AuthenticatedAppShell
      activeKey={null}
      activeOrganizationId={ORGANIZATION_ID}
      featureRequest={{ expectedOrganizationId: ORGANIZATION_ID, scope: { kind: "organization" } }}
    >
      <AccountSecurityPage {...args} includeMobileNavigation />
    </AuthenticatedAppShell>
  ),
} satisfies Meta<typeof AccountSecurityPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OverviewDesktop: Story = {};

export const GoogleOAuthReturnDesktop: Story = {
  args: {
    flow: "connect-google",
    oauth: "google",
    onGoogleOAuthReturnHandled: () => {},
  },
};

export const OverviewMobileSmall: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

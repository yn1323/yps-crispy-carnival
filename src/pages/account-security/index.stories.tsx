import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthenticatedAppShell } from "@/src/components/templates/AuthenticatedAppShell";
import { AccountSecurityPage } from ".";

const meta = {
  title: "Pages/AccountSecurity/Composition",
  component: AccountSecurityPage,
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
  render: (args) => (
    <AuthenticatedAppShell activeKey={null}>
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

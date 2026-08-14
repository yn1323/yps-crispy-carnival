import type { Meta, StoryObj } from "@storybook/react-vite";
import { MOBILE_APP_NAVIGATION_HEIGHT } from "@/src/components/features/AuthenticatedApp/AppPrimaryNavigation";
import { FullPageSpinner } from ".";

const meta = {
  title: "Templates/FullPageSpinner",
  component: FullPageSpinner,
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof FullPageSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Public: Story = {};

export const AuthenticatedPending: Story = {
  args: { reserveHeaderSpace: true },
};

export const AuthenticatedPendingWithMobileNavigation: Story = {
  args: { reserveHeaderSpace: true, mobileNavigationHeight: MOBILE_APP_NAVIGATION_HEIGHT },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const AuthenticatedWithHeader: Story = {
  args: { showHeader: true, mobileNavigationHeight: MOBILE_APP_NAVIGATION_HEIGHT },
};

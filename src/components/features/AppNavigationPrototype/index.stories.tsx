import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import type { AppNavigationKey } from "@/src/components/features/AuthenticatedApp/AppPrimaryNavigation";
import { AuthenticatedAppShell } from "@/src/components/templates/AuthenticatedAppShell";
import { FocusedFlowHeader } from "@/src/components/templates/FocusedFlowHeader";
import {
  PrototypeAccountView,
  PrototypeActionsView,
  PrototypeHomeView,
  PrototypeManageBillingView,
  PrototypeManageInviteNewView,
  PrototypeManageInviteStaffView,
  PrototypeManageManagersView,
  PrototypeManageOrganizationView,
  PrototypeManageShopDetailView,
  PrototypeManageView,
  PrototypeShiftBoardView,
  PrototypeShiftsView,
  PrototypeStaffDetailView,
  PrototypeStaffShopDetailView,
  PrototypeStaffView,
} from ".";
import { APP_PROTOTYPE_IDS } from "./fixtures";

type NavigationFrameProps = {
  activeKey: AppNavigationKey | null;
  children: ReactNode;
};

function NavigationFrame({ activeKey, children }: NavigationFrameProps) {
  return <AuthenticatedAppShell activeKey={activeKey}>{children}</AuthenticatedAppShell>;
}

type FocusedFrameProps = {
  title: string;
  backLabel: string;
  children: ReactNode;
};

function FocusedFrame({ title, backLabel, children }: FocusedFrameProps) {
  return (
    <Box w="full" minH="100dvh" bg="gray.50">
      <FocusedFlowHeader title={title} backLabel={backLabel} backAriaLabel={backLabel} />
      {children}
    </Box>
  );
}

const meta = {
  title: "Features/AppNavigationPrototype/FullPages",
  component: PrototypeHomeView,
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof PrototypeHomeView>;

export default meta;
type Story = StoryObj<typeof meta>;

const mobile1 = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
} satisfies Partial<Story>;

const mobile2 = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
} satisfies Partial<Story>;

export const HomeMobile: Story = {
  ...mobile2,
  render: () => (
    <NavigationFrame activeKey="home">
      <PrototypeHomeView />
    </NavigationFrame>
  ),
};

export const ShiftsMobile: Story = {
  ...mobile2,
  render: () => (
    <NavigationFrame activeKey="shifts">
      <PrototypeShiftsView />
    </NavigationFrame>
  ),
};

export const ShiftBoardMobile: Story = {
  ...mobile1,
  render: () => (
    <FocusedFrame title="シフトを調整" backLabel="シフト一覧へ戻る">
      <PrototypeShiftBoardView />
    </FocusedFrame>
  ),
};

export const StaffMobile: Story = {
  ...mobile2,
  render: () => (
    <NavigationFrame activeKey="staff">
      <PrototypeStaffView />
    </NavigationFrame>
  ),
};

export const StaffDetailMobile: Story = {
  ...mobile2,
  render: () => (
    <NavigationFrame activeKey="staff">
      <PrototypeStaffDetailView />
    </NavigationFrame>
  ),
};

export const StaffShopDetailMobile: Story = {
  ...mobile2,
  render: () => (
    <NavigationFrame activeKey="staff">
      <PrototypeStaffShopDetailView shopId={APP_PROTOTYPE_IDS.shop} />
    </NavigationFrame>
  ),
};

export const ActionsMobile: Story = {
  ...mobile2,
  render: () => (
    <NavigationFrame activeKey="actions">
      <PrototypeActionsView />
    </NavigationFrame>
  ),
};

export const ManageMobile: Story = {
  ...mobile2,
  render: () => (
    <NavigationFrame activeKey="manage">
      <PrototypeManageView />
    </NavigationFrame>
  ),
};

export const ManageOrganizationMobile: Story = {
  ...mobile2,
  render: () => (
    <NavigationFrame activeKey="manage">
      <PrototypeManageOrganizationView />
    </NavigationFrame>
  ),
};

export const ManageManagersMobile: Story = {
  ...mobile1,
  render: () => (
    <NavigationFrame activeKey="manage">
      <PrototypeManageManagersView />
    </NavigationFrame>
  ),
};

export const ManageInviteStaffMobile: Story = {
  ...mobile2,
  render: () => (
    <FocusedFrame title="既存スタッフを招待" backLabel="管理者と権限へ戻る">
      <PrototypeManageInviteStaffView />
    </FocusedFrame>
  ),
};

export const ManageInviteNewMobile: Story = {
  ...mobile2,
  render: () => (
    <FocusedFrame title="新しい管理者を招待" backLabel="管理者と権限へ戻る">
      <PrototypeManageInviteNewView />
    </FocusedFrame>
  ),
};

export const ManageBillingMobile: Story = {
  ...mobile1,
  render: () => (
    <NavigationFrame activeKey="manage">
      <PrototypeManageBillingView />
    </NavigationFrame>
  ),
};

export const ManageShopDetailMobile: Story = {
  ...mobile1,
  render: () => (
    <NavigationFrame activeKey="manage">
      <PrototypeManageShopDetailView />
    </NavigationFrame>
  ),
};

export const AccountMobile: Story = {
  ...mobile2,
  render: () => (
    <NavigationFrame activeKey={null}>
      <PrototypeAccountView />
    </NavigationFrame>
  ),
};

// Desktop VRTはmobile tagを除外するprojectで撮るため、代表画面を別Storyとして公開する。
export const HomeDesktop: Story = {
  render: () => (
    <NavigationFrame activeKey="home">
      <PrototypeHomeView />
    </NavigationFrame>
  ),
};

export const ShiftsDesktop: Story = {
  render: () => (
    <NavigationFrame activeKey="shifts">
      <PrototypeShiftsView />
    </NavigationFrame>
  ),
};

export const StaffDetailDesktop: Story = {
  render: () => (
    <NavigationFrame activeKey="staff">
      <PrototypeStaffDetailView />
    </NavigationFrame>
  ),
};

export const ManageDesktop: Story = {
  render: () => (
    <NavigationFrame activeKey="manage">
      <PrototypeManageView />
    </NavigationFrame>
  ),
};

export const ShiftBoardDesktop: Story = {
  render: () => (
    <FocusedFrame title="シフトを調整" backLabel="シフト一覧へ戻る">
      <PrototypeShiftBoardView />
    </FocusedFrame>
  ),
};

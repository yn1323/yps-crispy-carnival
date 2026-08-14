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
} from "@/src/components/features/AppNavigationPrototype";

export function AppHomePage() {
  return <PrototypeHomeView />;
}

export function AppShiftsPage() {
  return <PrototypeShiftsView />;
}

export function AppShiftBoardPage() {
  return <PrototypeShiftBoardView />;
}

export function AppStaffPage() {
  return <PrototypeStaffView />;
}

export function AppStaffDetailPage() {
  return <PrototypeStaffDetailView />;
}

type AppStaffShopDetailPageProps = {
  shopId: string;
};

export function AppStaffShopDetailPage({ shopId }: AppStaffShopDetailPageProps) {
  return <PrototypeStaffShopDetailView shopId={shopId} />;
}

export function AppActionsPage() {
  return <PrototypeActionsView />;
}

export function AppManagePage() {
  return <PrototypeManageView />;
}

export function AppManageOrganizationPage() {
  return <PrototypeManageOrganizationView />;
}

export function AppManageManagersPage() {
  return <PrototypeManageManagersView />;
}

export function AppManageInviteStaffPage() {
  return <PrototypeManageInviteStaffView />;
}

export function AppManageInviteNewPage() {
  return <PrototypeManageInviteNewView />;
}

export function AppManageBillingPage() {
  return <PrototypeManageBillingView />;
}

export function AppManageShopDetailPage() {
  return <PrototypeManageShopDetailView />;
}

export function AppAccountPage() {
  return <PrototypeAccountView />;
}

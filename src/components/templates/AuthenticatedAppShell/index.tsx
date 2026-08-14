import { Box } from "@chakra-ui/react";
import { lazy, type ReactNode, Suspense } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type AppNavigationKey,
  DesktopAppPrimaryNavigation,
  MOBILE_APP_NAVIGATION_HEIGHT,
  MobileAppPrimaryNavigation,
} from "@/src/components/features/AuthenticatedApp/AppPrimaryNavigation";
import { AppFeatureRequestAction, type AppFeatureRequestScope } from "@/src/components/features/FeatureRequestDialog";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";

export const AUTHENTICATED_APP_CONTENT_HEIGHT = {
  base: `calc(100dvh - ${HEADER_HEIGHT.base} - ${MOBILE_APP_NAVIGATION_HEIGHT} - env(safe-area-inset-bottom))`,
  md: `calc(100dvh - ${HEADER_HEIGHT.md} - ${MOBILE_APP_NAVIGATION_HEIGHT} - env(safe-area-inset-bottom))`,
  lg: `calc(100dvh - ${HEADER_HEIGHT.md})`,
} as const;

const UserMenu = lazy(() =>
  import("@/src/components/features/UserMenu").then((module) => ({ default: module.UserMenu })),
);

type Props = {
  activeKey: AppNavigationKey | null;
  activeOrganizationId?: string | null;
  organizationSwitcher?: ReactNode;
  featureRequest?: {
    expectedOrganizationId: Id<"organizations">;
    scope: AppFeatureRequestScope;
  };
  children: ReactNode;
};

export function AuthenticatedAppShell({
  activeKey,
  activeOrganizationId,
  organizationSwitcher,
  featureRequest,
  children,
}: Props) {
  return (
    <Box w="full" minH="100dvh" bg="gray.50">
      <Header
        brandTo="/dashboard"
        brandSearch={activeOrganizationId ? { org: activeOrganizationId } : undefined}
        brandAriaLabel="ホームへ"
        primaryNavigation={
          <DesktopAppPrimaryNavigation activeKey={activeKey} activeOrganizationId={activeOrganizationId} />
        }
        userActions={
          <>
            {organizationSwitcher}
            {featureRequest && <AppFeatureRequestAction {...featureRequest} />}
            <Suspense fallback={<Box boxSize={8} aria-hidden />}>
              <UserMenu tone="light" />
            </Suspense>
          </>
        }
      />
      <Box
        pt={HEADER_HEIGHT}
        pb={{ base: `calc(${MOBILE_APP_NAVIGATION_HEIGHT} + env(safe-area-inset-bottom))`, lg: 0 }}
        minH="100dvh"
      >
        {children}
      </Box>
      <MobileAppPrimaryNavigation activeKey={activeKey} activeOrganizationId={activeOrganizationId} />
    </Box>
  );
}

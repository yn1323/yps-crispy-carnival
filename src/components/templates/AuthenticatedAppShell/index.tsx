import { Box } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { lazy, type ReactNode, Suspense } from "react";
import {
  type AppNavigationKey,
  DesktopAppPrimaryNavigation,
  MOBILE_APP_NAVIGATION_HEIGHT,
  MobileAppPrimaryNavigation,
} from "@/src/components/features/AuthenticatedApp/AppPrimaryNavigation";
import { FeatureRequestAction } from "@/src/components/features/FeatureRequestDialog";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";
import { hasSelectedShopAtom } from "@/src/stores/shop";

const UserMenu = lazy(() =>
  import("@/src/components/features/UserMenu").then((module) => ({ default: module.UserMenu })),
);

type Props = {
  activeKey: AppNavigationKey | null;
  children: ReactNode;
};

export function AuthenticatedAppShell({ activeKey, children }: Props) {
  const hasSelectedShop = useAtomValue(hasSelectedShopAtom);

  return (
    <Box w="full" minH="100dvh" bg="gray.50">
      <Header
        brandTo="/app/home"
        brandAriaLabel="ホームへ"
        showTagline={false}
        primaryNavigation={<DesktopAppPrimaryNavigation activeKey={activeKey} />}
        userActions={
          <>
            {hasSelectedShop && <FeatureRequestAction />}
            <Suspense fallback={<Box boxSize={8} aria-hidden />}>
              <UserMenu tone="light" accountDestination="/app/account" showOrganizationSettings={false} />
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
      <MobileAppPrimaryNavigation activeKey={activeKey} />
    </Box>
  );
}

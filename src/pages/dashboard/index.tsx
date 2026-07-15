import { Box } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { Dashboard, DashboardSkeleton } from "@/src/components/features/Dashboard";
import { Animation } from "@/src/components/templates/Animation";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";

export function DashboardPage() {
  const shop = useQuery(api.dashboard.queries.getDashboardShop);
  const currentUser = useQuery(api.dashboard.queries.getCurrentUser, {});
  const managerLegalConsentStatus = useQuery(
    api.legal.queries.getManagerConsentStatus,
    shop === undefined || shop === null ? "skip" : {},
  );

  const isDashboardInitialLoading =
    shop === undefined || (shop !== null && (currentUser === undefined || managerLegalConsentStatus === undefined));

  if (isDashboardInitialLoading) {
    return (
      <DashboardPageShell>
        <Animation>
          <DashboardSkeleton />
        </Animation>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell>
      <Animation>
        <Dashboard shop={shop} currentUser={currentUser} managerLegalConsentStatus={managerLegalConsentStatus} />
      </Animation>
    </DashboardPageShell>
  );
}

const DashboardPageShell = ({ children }: { children: ReactNode }) => (
  <Box
    minH={{
      base: `calc(100dvh - ${HEADER_HEIGHT.base})`,
      md: `calc(100dvh - ${HEADER_HEIGHT.md})`,
    }}
    bg="white"
  >
    <RootContentWrapper>{children}</RootContentWrapper>
  </Box>
);

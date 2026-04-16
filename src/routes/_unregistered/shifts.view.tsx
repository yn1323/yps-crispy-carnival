import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ExpiredView } from "@/src/components/features/StaffView/ExpiredView";
import { RateLimitedView } from "@/src/components/features/StaffView/RateLimitedView";
import { ShiftViewPage } from "@/src/components/features/StaffView/ShiftViewPage";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { buildMeta } from "@/src/helpers/seo";
import { useStaffSession } from "@/src/hooks/useStaffSession";

export const Route = createFileRoute("/_unregistered/shifts/view")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: "シフト確認", noindex: true }),
  }),
  component: ShiftViewRoute,
});

function ShiftViewRoute() {
  const { token } = Route.useSearch();
  const state = useStaffSession(token);

  if (state.status === "loading") return <FullPageSpinner />;
  if (state.status === "rateLimited") return <RateLimitedView title="シフト閲覧" />;
  if (state.status === "expired") {
    return (
      <StaffLayout shopName="シフト閲覧">
        <ExpiredView recruitmentId={state.recruitmentId} />
      </StaffLayout>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <StaffLayout shopName="シフト閲覧">
          <ExpiredView recruitmentId={state.session.recruitmentId} />
        </StaffLayout>
      }
      onError={(error) => {
        if (error.message?.includes("ArgumentValidationError")) {
          state.clearSession();
        }
      }}
    >
      <ShiftViewContent session={state.session} />
    </ErrorBoundary>
  );
}

function ShiftViewContent({ session }: { session: { sessionToken: string; recruitmentId: string } }) {
  const data = useQuery(api.staffAuth.queries.getShiftViewData, {
    sessionToken: session.sessionToken,
    recruitmentId: session.recruitmentId as Id<"recruitments">,
  });

  if (data === undefined) return <FullPageSpinner />;

  if (data === null) {
    return (
      <StaffLayout shopName="シフト閲覧">
        <ExpiredView recruitmentId={session.recruitmentId} />
      </StaffLayout>
    );
  }

  return (
    <StaffLayout shopName={data.shopName}>
      <ShiftViewPage
        periodLabel={data.periodLabel}
        periodStart={data.periodStart}
        periodEnd={data.periodEnd}
        staffs={data.staffs}
        assignments={data.assignments}
        timeRange={data.timeRange}
      />
    </StaffLayout>
  );
}

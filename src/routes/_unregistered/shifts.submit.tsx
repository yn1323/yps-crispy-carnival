import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DayEntry } from "@/src/components/features/StaffSubmit/DayCard";
import { ExpiredSubmitView } from "@/src/components/features/StaffSubmit/ExpiredSubmitView";
import { ShiftSubmitPage } from "@/src/components/features/StaffSubmit/ShiftSubmitPage";
import { RateLimitedView } from "@/src/components/features/StaffView/RateLimitedView";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { buildMeta } from "@/src/helpers/seo";
import { useStaffSession } from "@/src/hooks/useStaffSession";

export const Route = createFileRoute("/_unregistered/shifts/submit")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: "希望シフト提出", noindex: true }),
  }),
  component: ShiftSubmitRoute,
});

function ShiftSubmitRoute() {
  const { token } = Route.useSearch();
  const state = useStaffSession(token);

  if (state.status === "loading") return <FullPageSpinner />;
  if (state.status === "rateLimited") return <RateLimitedView title="シフト提出" />;
  if (state.status === "expired") return <ExpiredSubmitView shopName="シフト提出" />;

  return (
    <ErrorBoundary
      fallback={<ExpiredSubmitView shopName="シフト提出" />}
      onError={(error) => {
        if (error.message?.includes("ArgumentValidationError")) {
          state.clearSession();
        }
      }}
    >
      <ShiftSubmitContent session={state.session} />
    </ErrorBoundary>
  );
}

function ShiftSubmitContent({ session }: { session: { sessionToken: string; recruitmentId: string } }) {
  const navigate = useNavigate();
  const data = useQuery(api.shiftSubmission.queries.getSubmissionPageData, {
    sessionToken: session.sessionToken,
    recruitmentId: session.recruitmentId as Id<"recruitments">,
  });
  const submitMutation = useMutation(api.shiftSubmission.mutations.submitShiftRequests);

  if (data === undefined) return <FullPageSpinner />;
  if (data === null) return <ExpiredSubmitView shopName="シフト提出" />;

  const handleSubmit = async (entries: DayEntry[]) => {
    const requests = entries
      .filter((e) => e.isWorking)
      .map((e) => ({ date: e.date, startTime: e.startTime, endTime: e.endTime }));
    await submitMutation({
      sessionToken: session.sessionToken,
      recruitmentId: session.recruitmentId as Id<"recruitments">,
      requests,
    });
    await navigate({ to: "/shifts/submit/completed" });
  };

  return <ShiftSubmitPage data={data} onSubmit={handleSubmit} />;
}

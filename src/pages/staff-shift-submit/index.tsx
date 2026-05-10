import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DayEntry } from "@/src/components/features/StaffSubmit/DayCard";
import { ExpiredSubmitView } from "@/src/components/features/StaffSubmit/ExpiredSubmitView";
import { ShiftSubmitPage } from "@/src/components/features/StaffSubmit/ShiftSubmitPage";
import { useSubmitShiftRequests } from "@/src/components/features/StaffSubmit/useSubmitShiftRequests";
import { NetworkErrorView } from "@/src/components/features/StaffView/NetworkErrorView";
import { RateLimitedView } from "@/src/components/features/StaffView/RateLimitedView";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { useStaffSession } from "@/src/hooks/useStaffSession";

type Props = {
  token: string | undefined;
};

export function StaffShiftSubmitPage({ token }: Props) {
  const state = useStaffSession(token);

  if (state.status === "loading") return <FullPageSpinner />;
  if (state.status === "rateLimited") return <RateLimitedView title="シフト提出" />;
  if (state.status === "networkError") {
    return (
      <StaffLayout shopName="シフト提出">
        <NetworkErrorView onRetry={state.retry} />
      </StaffLayout>
    );
  }
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
  const submitShiftRequests = useSubmitShiftRequests(session);

  if (data === undefined) return <FullPageSpinner />;
  if (data === null) return <ExpiredSubmitView shopName="シフト提出" />;

  const handleSubmit = async (entries: DayEntry[], acceptedLegal?: boolean) => {
    await submitShiftRequests(entries, acceptedLegal);
    await navigate({ to: "/shifts/submit/completed" });
  };

  return <ShiftSubmitPage data={data} onSubmit={handleSubmit} />;
}

import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { LuTriangleAlert, LuWifiOff } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftSubmitPage } from "@/src/components/features/StaffSubmit/ShiftSubmitPage";
import type { SubmitShiftSelectionInput } from "@/src/components/features/StaffSubmit/SubmitFormView";
import { SubmitUnavailableView } from "@/src/components/features/StaffSubmit/SubmitUnavailableView";
import { useSubmitShiftRequests } from "@/src/components/features/StaffSubmit/useSubmitShiftRequests";
import { StaffCenteredContent, StaffLayout } from "@/src/components/templates/StaffLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { useStaffSession } from "@/src/hooks/useStaffSession";

type Props = {
  token: string | undefined;
};

export function StaffShiftSubmitPage({ token }: Props) {
  const state = useStaffSession(token, "submit");

  if (state.status === "loading") return <FullPageSpinner />;
  if (state.status === "rateLimited") {
    return (
      <StaffLayout shopName="シフト提出">
        <StaffCenteredContent>
          <Empty
            icon={LuTriangleAlert}
            title="しばらく待ってから開いてください"
            description={"しばらく時間を置いてから\n再度アクセスしてください"}
            tone="warning"
          />
        </StaffCenteredContent>
      </StaffLayout>
    );
  }
  if (state.status === "networkError") {
    return (
      <StaffLayout shopName="シフト提出">
        <StaffCenteredContent>
          <Empty
            icon={LuWifiOff}
            title="ページを開けませんでした"
            description={"通信が切れた可能性があります。\nもう一度読み込むか、Safari、Chrome、Edgeで開いてください。"}
            tone="warning"
            action={
              <Button colorPalette="teal" size="md" borderRadius="lg" px={6} onClick={state.retry}>
                再試行する
              </Button>
            }
          />
        </StaffCenteredContent>
      </StaffLayout>
    );
  }
  if (state.status === "expired") {
    return <SubmitUnavailableView reason={state.reason} />;
  }

  return (
    <ErrorBoundary
      fallback={<SubmitUnavailableView reason="invalid_link" />}
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
    accessKind: "submit",
    recruitmentId: session.recruitmentId as Id<"recruitments">,
  });
  const submitShiftRequests = useSubmitShiftRequests(session);
  const { run: handleSubmit } = useSingleFlight(
    async (submission: SubmitShiftSelectionInput, acceptedLegal?: boolean) => {
      if (data?.status !== "ok") return;

      await submitShiftRequests(submission, acceptedLegal);
      await navigate({ to: "/shifts/submit/completed", search: { shopName: data.data.shopName } });
    },
  );

  if (data === undefined) return <FullPageSpinner />;
  if (data.status === "unavailable") {
    return <SubmitUnavailableView reason={data.reason} />;
  }

  return <ShiftSubmitPage data={data.data} onSubmit={handleSubmit} />;
}

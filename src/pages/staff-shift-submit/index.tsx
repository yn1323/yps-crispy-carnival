import { useQuery } from "convex/react";
import { LuTriangleAlert, LuWifiOff } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffFeatureRequestAction } from "@/src/components/features/FeatureRequestDialog";
import { StaffAccessBoundary, type StaffAccessState } from "@/src/components/features/StaffAccess";
import { StaffSubmit, SubmitUnavailableView } from "@/src/components/features/StaffSubmit";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { StaffCenteredContent, StaffLayout } from "@/src/components/templates/StaffLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";

type Props = {
  token: string | undefined;
};

export function StaffShiftSubmitPage({ token }: Props) {
  return (
    <StaffAccessBoundary token={token} accessKind="submit">
      {(state) => <StaffShiftSubmitState state={state} />}
    </StaffAccessBoundary>
  );
}

function StaffShiftSubmitState({ state }: { state: StaffAccessState }) {
  if (state.status === "loading") return <FullPageSpinner />;
  if (state.status === "rateLimited") {
    return (
      <StaffLayout shopName="シフト提出">
        <StaffCenteredContent>
          <Empty
            icon={LuTriangleAlert}
            title="アクセスが集中しています"
            description="少し時間をおいて、もう一度お試しください。"
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
            description={
              "通信が切れた可能性があります。\nもう一度読み込むか、Safari・Chrome・Edgeなどのブラウザで開いてください。"
            }
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
  const data = useQuery(api.shiftSubmission.queries.getSubmissionPageData, {
    sessionToken: session.sessionToken,
    accessKind: "submit",
    recruitmentId: session.recruitmentId as Id<"recruitments">,
  });
  if (data === undefined) return <FullPageSpinner />;
  if (data.status === "unavailable") {
    return <SubmitUnavailableView reason={data.reason} />;
  }

  return (
    <StaffSubmit
      key={session.recruitmentId}
      data={data.data}
      session={session}
      headerAction={<StaffFeatureRequestAction sessionToken={session.sessionToken} />}
    />
  );
}

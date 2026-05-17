import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { LuCalendarX, LuTriangleAlert, LuWifiOff } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftSubmitPage } from "@/src/components/features/StaffSubmit/ShiftSubmitPage";
import type { SubmitShiftSelectionInput } from "@/src/components/features/StaffSubmit/SubmitFormView";
import { SubmitPageHeader, SubmitPageLayout } from "@/src/components/features/StaffSubmit/SubmitPageLayout";
import { useSubmitShiftRequests } from "@/src/components/features/StaffSubmit/useSubmitShiftRequests";
import { StaffCenteredContent, StaffLayout } from "@/src/components/templates/StaffLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
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
    return (
      <SubmitPageLayout>
        <SubmitPageHeader shopName="シフト提出" />
        <Empty
          icon={LuCalendarX}
          title="提出締切を過ぎました"
          description={"変更したい日がある場合は、\nシフト作成担当者に連絡してください。"}
          tone="neutral"
          flex={1}
        />
      </SubmitPageLayout>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <SubmitPageLayout>
          <SubmitPageHeader shopName="シフト提出" />
          <Empty
            icon={LuCalendarX}
            title="提出締切を過ぎました"
            description={"変更したい日がある場合は、\nシフト作成担当者に連絡してください。"}
            tone="neutral"
            flex={1}
          />
        </SubmitPageLayout>
      }
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

  if (data === undefined) return <FullPageSpinner />;
  if (data === null) {
    return (
      <SubmitPageLayout>
        <SubmitPageHeader shopName="シフト提出" />
        <Empty
          icon={LuCalendarX}
          title="提出締切を過ぎました"
          description={"変更したい日がある場合は、\nシフト作成担当者に連絡してください。"}
          tone="neutral"
          flex={1}
        />
      </SubmitPageLayout>
    );
  }

  const handleSubmit = async (submission: SubmitShiftSelectionInput, acceptedLegal?: boolean) => {
    await submitShiftRequests(submission, acceptedLegal);
    await navigate({ to: "/shifts/submit/completed" });
  };

  return <ShiftSubmitPage data={data} onSubmit={handleSubmit} />;
}

import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { LuArrowLeft, LuCheck, LuRefreshCw, LuTriangleAlert } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import { getStoredSession } from "@/src/components/features/StaffAccess";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { StaffCenteredContent, StaffLayout } from "@/src/components/templates/StaffLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";

type Props = {
  recruitmentId?: string;
};

export type StaffShiftSubmitCompletedViewState =
  | { status: "loading" }
  | { status: "submitted"; shopName: string }
  | { status: "unavailable" }
  | { status: "error"; retry: () => void };

type ViewProps = {
  state: StaffShiftSubmitCompletedViewState;
  canGoBack?: boolean;
  onBack?: () => void;
};

export function StaffShiftSubmitCompletedView({ state, canGoBack = false, onBack = () => {} }: ViewProps) {
  if (state.status === "loading") return <FullPageSpinner />;

  if (state.status === "submitted") {
    return (
      <StaffLayout shopName={state.shopName}>
        <StaffCenteredContent>
          <Empty
            icon={LuCheck}
            title="提出が完了しました"
            description={
              "希望シフトを提出しました。\nシフトが確定すると、LINEまたはメールへお知らせを送ります。\nこのページは閉じて大丈夫です。"
            }
            tone="brand"
            iconVariant="circle"
            size="lg"
            bg="white"
            px={4}
            action={
              canGoBack ? (
                <Button variant="outline" colorPalette="teal" size="md" borderRadius="lg" px={6} onClick={onBack}>
                  <LuArrowLeft />
                  前の画面に戻る
                </Button>
              ) : undefined
            }
          />
        </StaffCenteredContent>
      </StaffLayout>
    );
  }

  const isError = state.status === "error";
  return (
    <StaffLayout shopName="シフト提出">
      <StaffCenteredContent>
        <Empty
          icon={isError ? LuRefreshCw : LuTriangleAlert}
          title={isError ? "提出結果を読み込めませんでした" : "提出完了を確認できません"}
          description={
            isError
              ? "通信状態を確認して、もう一度お試しください。"
              : "元のLINEまたはメールから提出ページを開き直してください。\n解決しない場合は、シフト作成担当者に連絡してください。"
          }
          tone="warning"
          action={
            isError ? (
              <Button colorPalette="teal" size="md" borderRadius="lg" px={6} onClick={state.retry}>
                再試行する
              </Button>
            ) : undefined
          }
        />
      </StaffCenteredContent>
    </StaffLayout>
  );
}

export function StaffShiftSubmitCompletedPage({ recruitmentId }: Props) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const [retryRevision, setRetryRevision] = useState(0);
  const session = recruitmentId ? getStoredSession(recruitmentId, "submit") : null;

  if (!recruitmentId || !session) {
    return <StaffShiftSubmitCompletedView state={{ status: "unavailable" }} />;
  }

  return (
    <ErrorBoundary
      key={retryRevision}
      fallback={
        <StaffShiftSubmitCompletedView
          state={{ status: "error", retry: () => setRetryRevision((revision) => revision + 1) }}
        />
      }
    >
      <SubmissionResult
        recruitmentId={recruitmentId}
        sessionToken={session.sessionToken}
        canGoBack={canGoBack}
        onBack={() => router.history.back()}
      />
    </ErrorBoundary>
  );
}

function SubmissionResult({
  recruitmentId,
  sessionToken,
  canGoBack,
  onBack,
}: {
  recruitmentId: string;
  sessionToken: string;
  canGoBack: boolean;
  onBack: () => void;
}) {
  const result = useQuery(api.shiftSubmission.queries.getSubmissionResult, {
    sessionToken,
    accessKind: "submit",
    recruitmentId,
  });

  if (result === undefined) return <StaffShiftSubmitCompletedView state={{ status: "loading" }} />;
  if (result.status === "unavailable") {
    return <StaffShiftSubmitCompletedView state={{ status: "unavailable" }} />;
  }
  return (
    <StaffShiftSubmitCompletedView
      state={{ status: "submitted", shopName: result.shopName }}
      canGoBack={canGoBack}
      onBack={onBack}
    />
  );
}

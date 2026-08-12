import { useQuery } from "convex/react";
import { useState } from "react";
import { LuRefreshCw, LuTriangleAlert } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import { StaffShiftReissue } from "@/src/components/features/StaffShiftReissue";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { StaffCenteredContent, StaffLayout } from "@/src/components/templates/StaffLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { formatDatePeriodWithWeekday } from "@/src/domains/shift/date";

type Props = {
  recruitmentId?: string;
};

export type StaffShiftReissueState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; retry: () => void };

export function StaffShiftReissueStateView({ state }: { state: StaffShiftReissueState }) {
  if (state.status === "loading") return <FullPageSpinner />;

  const isError = state.status === "error";
  return (
    <StaffLayout shopName="シフト閲覧">
      <StaffCenteredContent>
        <Empty
          icon={isError ? LuRefreshCw : LuTriangleAlert}
          title={isError ? "募集情報を読み込めませんでした" : "このページから再発行できません"}
          description={
            isError
              ? "通信状態を確認して、もう一度お試しください。"
              : "元のLINEまたはメールを開き直してください。\n解決しない場合は、シフト作成担当者に連絡してください。"
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

export function StaffShiftReissuePage({ recruitmentId }: Props) {
  const [retryRevision, setRetryRevision] = useState(0);

  if (!recruitmentId) return <StaffShiftReissueStateView state={{ status: "unavailable" }} />;

  return (
    <ErrorBoundary
      key={retryRevision}
      fallback={
        <StaffShiftReissueStateView
          state={{ status: "error", retry: () => setRetryRevision((revision) => revision + 1) }}
        />
      }
    >
      <StaffShiftReissueQuery recruitmentId={recruitmentId} />
    </ErrorBoundary>
  );
}

function StaffShiftReissueQuery({ recruitmentId }: { recruitmentId: string }) {
  const info = useQuery(api.staffAuth.queries.getRecruitmentInfo, { recruitmentId });

  if (info === undefined) return <StaffShiftReissueStateView state={{ status: "loading" }} />;
  if (info === null) return <StaffShiftReissueStateView state={{ status: "unavailable" }} />;

  return (
    <StaffLayout shopName={info.shopName}>
      <StaffShiftReissue
        recruitmentId={info.recruitmentId}
        periodLabel={formatDatePeriodWithWeekday(info.periodStart, info.periodEnd)}
      />
    </StaffLayout>
  );
}

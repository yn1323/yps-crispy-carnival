import { useQuery } from "convex/react";
import { LuRefreshCw, LuTriangleAlert } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getExportBlockMessage, ShiftExportPage } from "@/src/components/features/ShiftExport";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";
import { useShiftBoardDayKey } from "@/src/hooks/useShiftBoardDayKey";

type Props = { organizationId: string; recruitmentId: string };

export function ShiftExportRoutePage(props: Props) {
  return (
    <ErrorBoundary key={`${props.organizationId}:${props.recruitmentId}`} fallback={<ExportUnavailable retry />}>
      <ShiftExportQuery {...props} />
    </ErrorBoundary>
  );
}

function ShiftExportQuery({ organizationId, recruitmentId }: Props) {
  const organizationDocumentId = organizationId as Id<"organizations">;
  const recruitmentDocumentId = recruitmentId as Id<"recruitments">;
  const refreshDayKey = useShiftBoardDayKey();
  const scope = useQuery(api.shiftBoard.queries.getShiftBoardShopScopeForOrganization, {
    organizationId: organizationDocumentId,
    recruitmentId: recruitmentDocumentId,
  });
  const data = useQuery(
    api.shiftExport.queries.getShiftExportData,
    scope
      ? {
          shopId: scope.shopId,
          expectedOrganizationId: organizationDocumentId,
          recruitmentId: recruitmentDocumentId,
          refreshDayKey,
        }
      : "skip",
  );
  if (scope === null || data === null) return <ExportUnavailable />;
  if (scope === undefined || data === undefined)
    return <ShiftoriLoading variant="section" message="シフト表を読み込んでいます" minH="100dvh" />;
  if (data.exportBlockReason)
    return (
      <Empty
        icon={LuTriangleAlert}
        title="シフト表を出力できません"
        description={getExportBlockMessage(data.exportBlockReason)}
        minH="100dvh"
      />
    );
  return <ShiftExportPage data={data} />;
}

function ExportUnavailable({ retry = false }: { retry?: boolean }) {
  return (
    <Empty
      icon={retry ? LuRefreshCw : LuTriangleAlert}
      title={retry ? "シフト表を読み込めませんでした" : "シフト表が見つかりません"}
      description={
        retry
          ? "通信状態を確認して、もう一度お試しください。"
          : "募集が削除されたか、この組織から閲覧できない可能性があります。"
      }
      minH="100dvh"
      action={retry ? <Button onClick={() => window.location.reload()}>再読み込みする</Button> : undefined}
    />
  );
}

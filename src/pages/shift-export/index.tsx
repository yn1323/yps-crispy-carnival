import { useQuery } from "convex/react";
import { LuRefreshCw, LuTriangleAlert } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftExportPage, useReceivedShiftExport } from "@/src/components/features/ShiftExport";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";

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
  const scope = useQuery(api.shiftBoard.queries.getShiftBoardShopScopeForOrganization, {
    organizationId: organizationDocumentId,
    recruitmentId: recruitmentDocumentId,
  });
  const received = useReceivedShiftExport(
    { organizationId, recruitmentId, shopId: scope?.shopId },
    scope === undefined ? undefined : scope !== null,
  );
  if (scope === null) return <ExportUnavailable />;
  if (scope === undefined || !received || (!received.snapshot && !received.error))
    return <ShiftoriLoading variant="section" message="Loading..." minH="100dvh" />;
  if (received.error || !received.snapshot)
    return (
      <Empty
        icon={LuTriangleAlert}
        title="シフトの読み込みに失敗しました。"
        description={received.error ?? "シフト表から出力画面を開き直してください。"}
        minH="100dvh"
      />
    );
  return (
    <>
      {!received.storageAvailable && (
        <p>このブラウザでは一時保存できません。再読み込みせずにダウンロードしてください。</p>
      )}
      <ShiftExportPage data={received.snapshot.data} />
    </>
  );
}

function ExportUnavailable({ retry = false }: { retry?: boolean }) {
  return (
    <Empty
      icon={retry ? LuRefreshCw : LuTriangleAlert}
      title={retry ? "シフトの読み込みに失敗しました。" : "シフトが見つかりません"}
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

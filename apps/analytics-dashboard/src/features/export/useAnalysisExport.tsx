import { Alert, Button, Flex, Link, Progress, Table, Text } from "@chakra-ui/react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AnalyticsApiError, fetchOrganizationExport, fetchShopExport } from "@/api/analyticsClient";
import type { OrganizationExportResponse, ShopExportResponse } from "@/api/analyticsTypes";
import { shopPath } from "@/features/analytics/format";
import { analyticsErrorMessage, IdText, Panel } from "@/features/analytics/PageState";
import { type AnalysisMapping, type AnalysisScope, buildAnalysisJson, type SkippedTarget } from "./analysisJson";

/** rate limit（毎分120回）に余裕を残すため、同時に読む件数を絞る。 */
const CONCURRENCY = 2;

export type AnalysisExportRequest = {
  scope: AnalysisScope;
  /** 店舗を直接指定する出力。 */
  shopIds?: string[];
  /** 組織の全店舗を出力する。 */
  organizationIds?: string[];
  /** 一覧の時点で削除済みだった店舗の数。 */
  deletedShopCount?: number;
};
type ExportState =
  | { status: "idle" }
  | { status: "running"; message: string; done: number; total: number }
  | {
      status: "done";
      fileName: string;
      mapping: AnalysisMapping;
      counts: { shops: number; people: number; skipped: number };
    }
  | { status: "error"; message: string };

function skipReason(error: unknown): SkippedTarget["reason"] {
  if (error instanceof AnalyticsApiError && error.status === 404) return "not_found";
  return "failed";
}
/** 認証切れと中止は出力全体を止め、それ以外の失敗は対象ごとに記録して続ける。 */
function isFatal(error: unknown, signal: AbortSignal) {
  return signal.aborted || (error instanceof AnalyticsApiError && error.status === 401);
}
async function runPool<T>(items: T[], signal: AbortSignal, task: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      signal.throwIfAborted();
      const item = items[next];
      next += 1;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}
function fileTimestamp(ms: number) {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
}
function download(json: unknown, fileName: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 分析用JSONを組み立てて保存する。取得したデータとIDと名称の対応表はこのhookの状態だけに持ち、
 * 画面を離れると破棄する。
 */
export function useAnalysisExport() {
  const [state, setState] = useState<ExportState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = useCallback(async (prepare: (signal: AbortSignal) => Promise<AnalysisExportRequest>) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const signal = controller.signal;
    const exportedAt = Date.now();
    try {
      setState({ status: "running", message: "対象を確認しています", done: 0, total: 0 });
      const request = await prepare(signal);
      const organizations = new Map<string, OrganizationExportResponse>();
      const shops: ShopExportResponse[] = [];
      const skipped: SkippedTarget[] = Array.from({ length: request.deletedShopCount ?? 0 }, () => ({
        target: "shop" as const,
        reason: "deleted" as const,
      }));
      const shopIds = new Set(request.shopIds ?? []);

      const loadOrganizations = async (ids: string[], message: string) => {
        let done = 0;
        setState({ status: "running", message, done, total: ids.length });
        await runPool(ids, signal, async (organizationId) => {
          try {
            const response = await fetchOrganizationExport(organizationId, signal);
            organizations.set(organizationId, response.data);
            for (const shop of response.data.shops) shopIds.add(shop.shopId);
          } catch (error) {
            if (isFatal(error, signal)) throw error;
            skipped.push({ target: "organization", reason: skipReason(error) });
          }
          done += 1;
          setState({ status: "running", message, done, total: ids.length });
        });
      };

      await loadOrganizations(request.organizationIds ?? [], "組織を確認しています");
      const targets = [...shopIds];
      let done = 0;
      setState({ status: "running", message: "店舗の詳細を取得しています", done, total: targets.length });
      await runPool(targets, signal, async (shopId) => {
        try {
          shops.push((await fetchShopExport(shopId, signal)).data);
        } catch (error) {
          if (isFatal(error, signal)) throw error;
          skipped.push({ target: "shop", reason: skipReason(error) });
        }
        done += 1;
        setState({ status: "running", message: "店舗の詳細を取得しています", done, total: targets.length });
      });
      // 店舗を直接指定した出力では、所属組織の概要をあとから読む。
      const missing = [...new Set(shops.map((shop) => shop.shop.organizationId))].filter(
        (id) => !organizations.has(id),
      );
      await loadOrganizations(missing, "所属組織を確認しています");

      const { json, mapping } = buildAnalysisJson({
        scope: request.scope,
        exportedAt,
        organizations: [...organizations.values()],
        shops,
        skipped,
      });
      const fileName = `shiftori-analysis-${request.scope.kind}-${fileTimestamp(exportedAt)}.json`;
      signal.throwIfAborted();
      download(json, fileName);
      setState({
        status: "done",
        fileName,
        mapping,
        counts: {
          shops: shops.length,
          people: new Set(shops.flatMap((shop) => shop.members.map((member) => member.personKey))).size,
          skipped: skipped.length,
        },
      });
    } catch (error) {
      if (signal.aborted) {
        setState({ status: "idle" });
        return;
      }
      setState({ status: "error", message: analyticsErrorMessage(error) });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);
  /** 実行中なら中止し、対応表も閉じる。 */
  const close = useCallback(() => {
    controllerRef.current?.abort();
    setState({ status: "idle" });
  }, []);
  return { state, start, close, isRunning: state.status === "running" };
}

export function AnalysisExportStatus({
  state,
  onClose,
}: {
  state: ReturnType<typeof useAnalysisExport>["state"];
  onClose: () => void;
}) {
  if (state.status === "idle") return null;
  if (state.status === "running")
    return (
      <Alert.Root status="info" borderRadius="md" aria-live="polite">
        <Alert.Content gap={2}>
          <Alert.Description>
            {state.message}
            {state.total > 0 && `（${state.done}/${state.total}）`}
            。件数が多いと数分かかります。
          </Alert.Description>
          {state.total > 0 && (
            <Progress.Root value={state.done} max={state.total} size="sm">
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>
          )}
        </Alert.Content>
        <Button size="sm" variant="outline" onClick={onClose}>
          中止
        </Button>
      </Alert.Root>
    );
  if (state.status === "error")
    return (
      <Alert.Root status="error" borderRadius="md">
        <Alert.Indicator />
        <Alert.Description>JSONを出力できませんでした。{state.message}</Alert.Description>
      </Alert.Root>
    );
  return (
    <Panel
      title="IDと名称の対応表"
      description={`${state.fileName}を保存しました（店舗${state.counts.shops}件・人物${state.counts.people}人${state.counts.skipped > 0 ? `・取得できなかった対象${state.counts.skipped}件` : ""}）。この表はファイルに含めず、画面を離れると消えます。`}
    >
      <Flex justify="end">
        <Button size="sm" variant="outline" onClick={onClose}>
          対応表を閉じる
        </Button>
      </Flex>
      <Table.ScrollArea>
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>ID</Table.ColumnHeader>
              <Table.ColumnHeader>名称</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {state.mapping.organizations.map((organization) => (
              <Fragment key={organization.organizationId}>
                <Table.Row bg="gray.50">
                  <Table.Cell>
                    <IdText value={organization.organizationId} />
                  </Table.Cell>
                  <Table.Cell fontWeight="bold">{organization.name}</Table.Cell>
                </Table.Row>
                {state.mapping.shops
                  .filter((shop) => shop.organizationId === organization.organizationId)
                  .map((shop) => (
                    <Table.Row key={shop.shopId}>
                      <Table.Cell pl={6}>
                        <IdText value={shop.shopId} />
                      </Table.Cell>
                      <Table.Cell>
                        <Link href={shopPath(shop.shopId)} color="blue.700">
                          {shop.name}
                        </Link>
                      </Table.Cell>
                    </Table.Row>
                  ))}
              </Fragment>
            ))}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
      <Text fontSize="xs" color="gray.600">
        ファイルの組織・店舗・スタッフ・ユーザーはDBのIDです。スタッフの名前はこの表に出しません。店舗のスタッフ詳細で確認できます。
      </Text>
    </Panel>
  );
}

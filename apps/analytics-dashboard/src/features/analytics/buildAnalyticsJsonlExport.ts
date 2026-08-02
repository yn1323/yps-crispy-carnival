import {
  AnalyticsApiError,
  fetchHealth,
  fetchMilestones,
  fetchOrganization,
  fetchOrganizations,
  fetchOverview,
  fetchSegments,
  fetchShop,
  fetchShopCycles,
  fetchShops,
  fetchTrends,
} from "@/api/analyticsClient";
import type {
  AnalyticsApiEnvelope,
  AnalyticsCycleRowDto,
  AnalyticsOrganizationRowDto,
  AnalyticsResponseMetadata,
  AnalyticsSegmentDimension,
  AnalyticsSegmentRowDto,
  AnalyticsShopRowDto,
  AnalyticsTrendMetric,
} from "@/api/analyticsTypes";
import type { AnalyticsSearchState } from "./useAnalyticsSearch";

const EXPORT_PAGE_SIZE = 100;
const EXPORT_REQUEST_INTERVAL_MS = 600;
const EXPORT_MAX_REQUESTS = 400;
const EXPORT_MAX_PAGES_PER_DATASET = 100;
const EXPORT_MAX_RECORDS = 25_000;
const EXPORT_MAX_BYTES = 20 * 1024 * 1024;
const EXPORT_DEADLINE_MS = 5 * 60 * 1000;
const EXPORT_MAX_RATE_LIMIT_RETRIES = 3;

const ALL_TREND_METRICS: readonly AnalyticsTrendMetric[] = [
  "organizationCount",
  "shopCount",
  "kpiEligibleShopCount",
  "activeShopCount",
  "personCount",
  "staffMembershipCount",
  "unlinkedStaffCount",
  "shiftTargetCount",
  "managerMembershipCount",
  "managerStaffCount",
  "northStarRate",
  "deadlineSubmissionRate",
  "finalSubmissionRate",
];

const SEGMENT_DIMENSIONS: readonly AnalyticsSegmentDimension[] = [
  "registrationCohort",
  "plan",
  "organizationShopCount",
  "shopStaffSize",
  "cadence",
  "lineUsage",
  "submissionTrend",
  "adoptionAge",
];

const FORBIDDEN_EXPORT_KEY =
  /(displayname|organizationname|shopname|staffname|managername|email|phone|lineuserid|comment|notification(body|payload)|submission(content|payload)|token|secret|credential|rawerror)/i;

type ExportProgress = (message: string) => void;
type JsonlRecord = Record<string, unknown>;
type DataWithMetadata = { metadata: AnalyticsResponseMetadata };
type SnapshotAnchor = {
  asOf: number | null;
  dataStartDate: string | null;
  environmentLabel: string;
  latestCompleteSnapshotDate: string | null;
};

export type AnalyticsJsonlFile = {
  byteLength: number;
  parts: BlobPart[];
  recordCount: number;
};

export class AnalyticsExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsExportError";
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

class ExportRequestGate {
  private readonly startedAt = Date.now();
  private lastRequestStartedAt = 0;
  private requestCount = 0;

  constructor(private readonly onProgress: ExportProgress) {}

  private remainingTime() {
    return EXPORT_DEADLINE_MS - (Date.now() - this.startedAt);
  }

  private async wait(milliseconds: number) {
    if (milliseconds <= 0) return;
    if (milliseconds >= this.remainingTime()) {
      throw new AnalyticsExportError("出力に時間がかかりすぎています。期間またはグループ・店舗を絞ってください。");
    }
    await delay(milliseconds);
  }

  async run<Result>(request: () => Promise<Result>): Promise<Result> {
    for (let rateLimitRetry = 0; ; rateLimitRetry += 1) {
      if (this.requestCount >= EXPORT_MAX_REQUESTS || this.remainingTime() <= 0) {
        throw new AnalyticsExportError("出力対象が大きすぎます。期間またはグループ・店舗を絞ってください。");
      }

      const pacingWait = Math.max(0, this.lastRequestStartedAt + EXPORT_REQUEST_INTERVAL_MS - Date.now());
      await this.wait(pacingWait);
      this.lastRequestStartedAt = Date.now();
      this.requestCount += 1;

      try {
        return await request();
      } catch (error) {
        if (
          !(error instanceof AnalyticsApiError) ||
          error.status !== 429 ||
          rateLimitRetry >= EXPORT_MAX_RATE_LIMIT_RETRIES
        ) {
          throw error;
        }
        this.onProgress("APIの取得上限を待っています");
        await this.wait(error.retryAfterMs ?? 60_000);
      }
    }
  }
}

function assertNoForbiddenKeys(value: unknown, path = "record") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) assertNoForbiddenKeys(item, `${path}[${index}]`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EXPORT_KEY.test(key.replaceAll("_", ""))) {
      throw new AnalyticsExportError(`AI向けJSONLへ除外対象のfieldが混入しました: ${path}.${key}`);
    }
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}

class JsonlWriter {
  private byteLength = 0;
  private readonly counts = new Map<string, number>();
  private readonly encoder = new TextEncoder();
  private readonly parts: string[] = [];
  private recordCount = 0;

  constructor(private readonly effectiveTo: string) {}

  append(record: JsonlRecord) {
    assertNoForbiddenKeys(record);
    if (typeof record.snapshotDate === "string" && record.snapshotDate > this.effectiveTo) {
      throw new AnalyticsExportError("固定した分析日より新しいsnapshotが混入しました。もう一度出力してください。");
    }

    const line = `${JSON.stringify(record)}\n`;
    const lineBytes = this.encoder.encode(line).byteLength;
    if (this.recordCount + 1 > EXPORT_MAX_RECORDS || this.byteLength + lineBytes > EXPORT_MAX_BYTES) {
      throw new AnalyticsExportError("JSONLが安全な出力上限を超えました。期間またはグループ・店舗を絞ってください。");
    }

    this.parts.push(line);
    this.byteLength += lineBytes;
    this.recordCount += 1;
    const recordType = typeof record.recordType === "string" ? record.recordType : "unknown";
    this.counts.set(recordType, (this.counts.get(recordType) ?? 0) + 1);
  }

  finish(): AnalyticsJsonlFile {
    this.append({
      recordType: "exportSummary",
      completedAt: new Date().toISOString(),
      dataRecordCount: this.recordCount,
      recordCounts: Object.fromEntries(this.counts),
    });
    return {
      byteLength: this.byteLength,
      parts: this.parts,
      recordCount: this.recordCount,
    };
  }
}

function selectedSegmentDimension(value: string | undefined) {
  return SEGMENT_DIMENSIONS.find((dimension) => dimension === value);
}

function effectiveExportTo(search: AnalyticsSearchState, latestCompleteSnapshotDate: string | null) {
  if (
    latestCompleteSnapshotDate &&
    latestCompleteSnapshotDate >= search.from &&
    latestCompleteSnapshotDate < search.to
  ) {
    return latestCompleteSnapshotDate;
  }
  return search.to;
}

function organizationRecord(row: AnalyticsOrganizationRowDto): JsonlRecord {
  return {
    recordType: "organization",
    organizationId: row.organizationId,
    registeredAt: row.registeredAt,
    deletedAt: row.deletedAt,
    currentPlan: row.currentPlan,
    firstShopAt: row.firstShopAt,
    secondShopAt: row.secondShopAt,
    secondShopFirstConfirmedAt: row.secondShopFirstConfirmedAt,
  };
}

function shopRecord(row: AnalyticsShopRowDto): JsonlRecord {
  return {
    recordType: "shop",
    organizationId: row.organizationId,
    shopId: row.shopId,
    registeredAt: row.registeredAt,
    deletedAt: row.deletedAt,
    currentPlan: row.currentPlan,
    milestoneDates: row.milestoneDates,
    latestActivityAt: row.latestActivityAt,
    nextCyclePeriodStart: row.nextCyclePeriodStart,
    cadence: row.cadence,
  };
}

function cycleRecord(row: AnalyticsCycleRowDto): JsonlRecord {
  return {
    recordType: "shiftCycle",
    recruitmentId: row.recruitmentId,
    organizationId: row.organizationId,
    shopId: row.shopId,
    sequenceNumber: row.sequenceNumber,
    createdAt: row.createdAt,
    submitDeadlineAt: row.submitDeadlineAt,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    confirmedAt: row.confirmedAt,
    deletedAt: row.deletedAt,
    closedAt: row.closedAt,
    deadlineSubmission: row.deadlineSubmission,
    finalSubmission: row.finalSubmission,
    notificationSentCount: row.notificationSentCount,
    notificationFailedCount: row.notificationFailedCount,
    reminderSentCount: row.reminderSentCount,
    creationLeadTimeMs: row.creationLeadTimeMs,
    confirmationLeadTimeMs: row.confirmationLeadTimeMs,
    confirmedBeforeStart: row.confirmedBeforeStart,
    completeness: row.completeness,
    finalizedAt: row.finalizedAt,
    updatedAt: row.updatedAt,
  };
}

function exportMetadata(metadata: AnalyticsResponseMetadata) {
  return {
    asOf: metadata.asOf,
    dataStartDate: metadata.dataStartDate,
    latestCompleteSnapshotDate: metadata.latestCompleteSnapshotDate,
    computedAt: metadata.computedAt,
    completeness: metadata.completeness,
    warnings: metadata.warnings,
    pageInfo: {
      isDone: metadata.pageInfo.isDone,
      pageSize: metadata.pageInfo.pageSize,
      returnedCount: metadata.pageInfo.returnedCount,
    },
  };
}

function appendMetadata(
  writer: JsonlWriter,
  dataset: string,
  metadata: AnalyticsResponseMetadata,
  context: JsonlRecord = {},
) {
  writer.append({
    recordType: "datasetMetadata",
    dataset,
    ...context,
    metadata: exportMetadata(metadata),
  });
}

function assertSnapshot(response: AnalyticsApiEnvelope<DataWithMetadata>, anchor: SnapshotAnchor) {
  const metadata = response.data.metadata;
  if (
    response.env.label !== anchor.environmentLabel ||
    metadata.asOf !== anchor.asOf ||
    metadata.dataStartDate !== anchor.dataStartDate ||
    metadata.latestCompleteSnapshotDate !== anchor.latestCompleteSnapshotDate
  ) {
    throw new AnalyticsExportError("分析データが出力中に更新されました。もう一度出力してください。");
  }
}

async function fetchValidated<Data extends DataWithMetadata>(
  gate: ExportRequestGate,
  anchor: SnapshotAnchor,
  request: () => Promise<AnalyticsApiEnvelope<Data>>,
) {
  const response = await gate.run(request);
  assertSnapshot(response, anchor);
  return response;
}

async function walkPages<Data extends DataWithMetadata, Row>(args: {
  anchor: SnapshotAnchor;
  dataset: string;
  fetchPage: (cursor: string | null) => Promise<AnalyticsApiEnvelope<Data>>;
  gate: ExportRequestGate;
  onRow: (row: Row) => boolean;
  rowsFrom: (data: Data) => Row[];
  writer: JsonlWriter;
  context?: JsonlRecord;
}) {
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  for (let page = 1; page <= EXPORT_MAX_PAGES_PER_DATASET; page += 1) {
    const response = await fetchValidated(args.gate, args.anchor, () => args.fetchPage(cursor));
    let emittedCount = 0;
    for (const row of args.rowsFrom(response.data)) {
      if (args.onRow(row)) emittedCount += 1;
    }
    appendMetadata(args.writer, args.dataset, response.data.metadata, {
      ...args.context,
      page,
      emittedCount,
    });

    const { continueCursor, isDone } = response.data.metadata.pageInfo;
    if (isDone) return;
    if (!continueCursor || seenCursors.has(continueCursor)) {
      throw new AnalyticsExportError("分析データの全ページを取得できませんでした。");
    }
    seenCursors.add(continueCursor);
    cursor = continueCursor;
  }

  throw new AnalyticsExportError(
    "一つの分析データがページ上限を超えました。期間またはグループ・店舗を絞ってください。",
  );
}

function manifestRecord(
  search: AnalyticsSearchState,
  anchor: SnapshotAnchor,
  effectiveTo: string,
  dimension: AnalyticsSegmentDimension | undefined,
): JsonlRecord {
  const hasEntityScope = Boolean(search.organizationId || search.shopId);
  return {
    recordType: "manifest",
    format: "shiftori.analytics.ai-jsonl",
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    timezone: "Asia/Tokyo",
    environment: { label: anchor.environmentLabel },
    selection: {
      requestedPeriod: { from: search.from, to: search.to },
      effectivePeriod: { from: search.from, to: effectiveTo },
      comparisonPeriod: { from: search.compareFrom, to: search.compareTo },
      granularity: search.granularity,
      scope: {
        organizationId: search.organizationId ?? null,
        shopId: search.shopId ?? null,
      },
      segmentDimension: dimension ?? null,
    },
    pointInTime: {
      asOf: anchor.asOf,
      dataStartDate: anchor.dataStartDate,
      latestCompleteSnapshotDate: anchor.latestCompleteSnapshotDate,
      consistency: "全requestで同じasOf、dataStartDate、latestCompleteSnapshotDateを確認しています。",
    },
    datasetScopes: {
      service: "organizationIdとshopIdを適用",
      organization: "選択scopeの識別record",
      organizationKpi: search.shopId ? "店舗scopeでは非出力" : "organizationIdを適用",
      shop: "organizationIdとshopIdを適用",
      shopKpi: "organizationIdとshopIdを適用",
      shiftCycle: "organizationIdとshopIdとeffectivePeriodを適用",
      segmentKpi: hasEntityScope ? "グループ・店舗scope非対応のため非出力" : "segmentDimensionを適用",
    },
    interpretation: {
      completeness: "completeは完全、partialは一部集計、unavailableは算出不可、pendingは初回構築または集計待ちです。",
      rates: "率はrateだけでなくnumeratorとdenominatorを併記しています。店舗率の単純平均ではありません。",
      joins: "organizationId、shopId、recruitmentIdで関連recordを結合してください。",
    },
    excludedData: [
      "グループ名と店舗名",
      "スタッフ氏名、メールアドレス、電話番号、LINE user ID",
      "シフト提出内容と通知本文",
      "要望一覧と要望本文",
      "service credentialと環境変数の値",
    ],
    safetyLimits: {
      maximumBytes: EXPORT_MAX_BYTES,
      maximumPagesPerDataset: EXPORT_MAX_PAGES_PER_DATASET,
      maximumRecords: EXPORT_MAX_RECORDS,
      maximumRequests: EXPORT_MAX_REQUESTS,
    },
  };
}

function seriesParams(search: AnalyticsSearchState, to: string) {
  return {
    from: search.from,
    granularity: search.granularity,
    organizationId: search.organizationId,
    shopId: search.shopId,
    to,
  };
}

export async function buildAnalyticsJsonlExport(
  search: AnalyticsSearchState,
  onProgress: ExportProgress,
): Promise<AnalyticsJsonlFile> {
  const gate = new ExportRequestGate(onProgress);
  onProgress("全体KPIを取得しています");
  const overview = await gate.run(() =>
    fetchOverview({
      compareFrom: search.compareFrom,
      compareTo: search.compareTo,
      from: search.from,
      organizationId: search.organizationId,
      shopId: search.shopId,
      to: search.to,
    }),
  );
  const anchor: SnapshotAnchor = {
    asOf: overview.data.metadata.asOf,
    dataStartDate: overview.data.metadata.dataStartDate,
    environmentLabel: overview.env.label,
    latestCompleteSnapshotDate: overview.data.metadata.latestCompleteSnapshotDate,
  };
  const effectiveTo = effectiveExportTo(search, anchor.latestCompleteSnapshotDate);
  const dimension = selectedSegmentDimension(search.dimension);
  const writer = new JsonlWriter(effectiveTo);
  writer.append(manifestRecord(search, anchor, effectiveTo, dimension));
  appendMetadata(writer, "serviceOverview", overview.data.metadata);
  writer.append({
    recordType: "serviceOverview",
    current: overview.data.current,
    comparison: overview.data.comparison,
  });

  onProgress("全体推移・導入到達度・healthを取得しています");
  const scopedSeries = seriesParams(search, effectiveTo);
  const trends = await fetchValidated(gate, anchor, () => fetchTrends({ ...scopedSeries, metrics: ALL_TREND_METRICS }));
  appendMetadata(writer, "serviceTrend", trends.data.metadata, {
    granularity: trends.data.granularity,
    metrics: trends.data.metrics,
    range: trends.data.range,
  });
  for (const point of trends.data.series) writer.append({ recordType: "serviceTrend", ...point });

  const milestones = await fetchValidated(gate, anchor, () => fetchMilestones(scopedSeries));
  appendMetadata(writer, "serviceMilestone", milestones.data.metadata, {
    granularity: milestones.data.granularity,
    range: milestones.data.range,
  });
  writer.append({
    recordType: "serviceMilestoneSummary",
    counts: milestones.data.current,
    rates: milestones.data.currentRates,
  });
  for (const point of milestones.data.series) {
    writer.append({ recordType: "serviceMilestone", ...point });
  }

  const health = await fetchValidated(gate, anchor, () => fetchHealth(scopedSeries));
  appendMetadata(writer, "serviceHealth", health.data.metadata, {
    granularity: health.data.granularity,
    range: health.data.range,
  });
  writer.append({ recordType: "serviceHealthSummary", counts: health.data.current });
  for (const point of health.data.series) writer.append({ recordType: "serviceHealth", ...point });

  const organizationIds: string[] = [];
  const shopRefs: Array<{ organizationId: string; shopId: string }> = [];
  const seenOrganizationIds = new Set<string>();
  const seenShopIds = new Set<string>();

  const appendOrganization = (row: AnalyticsOrganizationRowDto) => {
    if (seenOrganizationIds.has(row.organizationId)) return false;
    seenOrganizationIds.add(row.organizationId);
    organizationIds.push(row.organizationId);
    writer.append(organizationRecord(row));
    return true;
  };

  const appendShop = (row: AnalyticsShopRowDto) => {
    if (seenShopIds.has(row.shopId)) return false;
    seenShopIds.add(row.shopId);
    shopRefs.push({ organizationId: row.organizationId, shopId: row.shopId });
    writer.append(shopRecord(row));
    return true;
  };

  const fetchOrganizationDetail = async (organizationId: string, includeKpis: boolean) => {
    const response = await fetchValidated(gate, anchor, () =>
      fetchOrganization(organizationId, {
        cursor: null,
        from: search.from,
        granularity: search.granularity,
        limit: 1,
        to: effectiveTo,
      }),
    );
    if (!response.data.organization) {
      throw new AnalyticsExportError("指定されたグループの分析データが見つかりませんでした。");
    }
    appendOrganization(response.data.organization);
    appendMetadata(writer, includeKpis ? "organizationKpi" : "organization", response.data.metadata, {
      organizationId,
    });
    if (includeKpis) {
      for (const point of response.data.series) {
        writer.append({ recordType: "organizationKpi", organizationId, ...point });
      }
    }
    return response.data.organization;
  };

  const fetchShopDetail = async (shopId: string) => {
    const response = await fetchValidated(gate, anchor, () =>
      fetchShop(shopId, {
        from: search.from,
        granularity: search.granularity,
        to: effectiveTo,
      }),
    );
    if (!response.data.shop) {
      throw new AnalyticsExportError("指定された店舗の分析データが見つかりませんでした。");
    }
    appendShop(response.data.shop);
    appendMetadata(writer, "shopKpi", response.data.metadata, { shopId });
    for (const point of response.data.series) {
      writer.append({ recordType: "shopKpi", shopId, ...point });
    }
    return response.data.shop;
  };

  onProgress("グループと店舗の分析データを取得しています");
  if (search.shopId) {
    const shop = await fetchShopDetail(search.shopId);
    if (search.organizationId && shop.organizationId !== search.organizationId) {
      throw new AnalyticsExportError("指定されたグループと店舗の組み合わせが一致しません。");
    }
    await fetchOrganizationDetail(shop.organizationId, false);
  } else if (search.organizationId) {
    await fetchOrganizationDetail(search.organizationId, true);
    await walkPages({
      anchor,
      dataset: "shop",
      fetchPage: (cursor) =>
        fetchShops({
          cursor,
          from: search.from,
          limit: EXPORT_PAGE_SIZE,
          organizationId: search.organizationId,
          to: effectiveTo,
        }),
      gate,
      onRow: appendShop,
      rowsFrom: (data) => data.rows,
      writer,
    });
  } else {
    await walkPages({
      anchor,
      dataset: "organization",
      fetchPage: (cursor) =>
        fetchOrganizations({ cursor, from: search.from, limit: EXPORT_PAGE_SIZE, to: effectiveTo }),
      gate,
      onRow: appendOrganization,
      rowsFrom: (data) => data.rows,
      writer,
    });
    await walkPages({
      anchor,
      dataset: "shop",
      fetchPage: (cursor) => fetchShops({ cursor, from: search.from, limit: EXPORT_PAGE_SIZE, to: effectiveTo }),
      gate,
      onRow: appendShop,
      rowsFrom: (data) => data.rows,
      writer,
    });
    for (const [index, organizationId] of organizationIds.entries()) {
      onProgress(`グループ別推移を取得しています（${index + 1} / ${organizationIds.length}）`);
      await fetchOrganizationDetail(organizationId, true);
    }
  }

  for (const [index, shop] of shopRefs.entries()) {
    onProgress(`店舗別推移とシフト周期を取得しています（${index + 1} / ${shopRefs.length}）`);
    if (shop.shopId !== search.shopId) await fetchShopDetail(shop.shopId);
    const seenRecruitmentIds = new Set<string>();
    await walkPages({
      anchor,
      context: { shopId: shop.shopId },
      dataset: "shiftCycle",
      fetchPage: (cursor) =>
        fetchShopCycles(shop.shopId, {
          cursor,
          from: search.from,
          limit: EXPORT_PAGE_SIZE,
          to: effectiveTo,
        }),
      gate,
      onRow: (row: AnalyticsCycleRowDto) => {
        if (seenRecruitmentIds.has(row.recruitmentId)) return false;
        seenRecruitmentIds.add(row.recruitmentId);
        writer.append(cycleRecord(row));
        return true;
      },
      rowsFrom: (data) => data.rows,
      writer,
    });
  }

  if (search.organizationId || search.shopId) {
    writer.append({
      recordType: "datasetNotice",
      dataset: "segmentKpi",
      status: "omitted",
      reason: "segment APIはグループ・店舗scopeに対応していないため",
    });
  } else {
    onProgress("セグメント比較を取得しています");
    await walkPages({
      anchor,
      dataset: "segmentKpi",
      fetchPage: (cursor) =>
        fetchSegments({
          cursor,
          dimension,
          direction: "asc",
          from: search.from,
          limit: EXPORT_PAGE_SIZE,
          sort: "dimension",
          to: effectiveTo,
        }),
      gate,
      onRow: (row: AnalyticsSegmentRowDto) => {
        writer.append({ recordType: "segmentKpi", ...row });
        return true;
      },
      rowsFrom: (data) => data.rows,
      writer,
    });
  }

  onProgress("出力中の更新有無を確認しています");
  await fetchValidated(gate, anchor, () =>
    fetchOverview({
      compareFrom: search.compareFrom,
      compareTo: search.compareTo,
      from: search.from,
      organizationId: search.organizationId,
      shopId: search.shopId,
      to: search.to,
    }),
  );
  onProgress("JSONLファイルを作成しています");
  return writer.finish();
}

export function downloadAnalyticsJsonl(value: AnalyticsJsonlFile, search: AnalyticsSearchState) {
  const blob = new Blob(value.parts, { type: "application/x-ndjson;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `shiftori-analytics_${search.from}_${search.to}.jsonl`;
  link.href = url;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

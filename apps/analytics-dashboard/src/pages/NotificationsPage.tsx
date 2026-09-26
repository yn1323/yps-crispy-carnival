import { Badge, Box, Button, Flex, Grid, Input, Link, NativeSelect, Skeleton, Stack, Text } from "@chakra-ui/react";
import { addDays } from "@convex/_lib/dateFormat";
import { isAnalyticsDate } from "@convex/analyticsDashboard/schemas";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { fetchNotificationSummary, fetchNotifications, type NotificationSearchParams } from "@/api/analyticsClient";
import type { NotificationCategory, NotificationOutboxStatus, NotificationSearchRowDto } from "@/api/analyticsTypes";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { DataTable } from "@/components/DataTable";
import { PageHeading } from "@/components/PageHeading";
import { cyclePath, formatCount, formatDate, formatDateTime, shopPath, staffPath } from "@/features/analytics/format";
import { MoreButton, Panel, QueryError } from "@/features/analytics/PageState";
import {
  cancelReasonLabel,
  channelLabel,
  deliveryStatusLabel,
  errorCodeLabel,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_STATUS_COLORS,
  NOTIFICATION_STATUS_LABELS,
} from "@/features/notifications/labels";

const PAGE_SIZE = 40;
/** 条件に合う行が少ない期間でも一回の操作で結果を出せるよう、続きを数回まで自動で読む。 */
const AUTO_CONTINUE_REQUESTS = 5;
const MIN_ROWS_PER_LOAD = 20;
const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

type Filters = {
  from: string;
  to: string;
  shopId: string | null;
  status: NotificationOutboxStatus | null;
  channel: "email" | "line" | null;
  category: NotificationCategory | null;
  lookup: string | null;
};

function todayJst() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(Date.now());
}
function readFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  // 手入力された不正な日付で画面を壊さず、既定の期間へ戻す。
  const inputFrom = params.get("from");
  const inputTo = params.get("to");
  const validRange = inputFrom !== null && inputTo !== null && isAnalyticsDate(inputFrom) && isAnalyticsDate(inputTo);
  const to = validRange ? inputTo : todayJst();
  const status = params.get("status");
  const channel = params.get("channel");
  const category = params.get("category");
  return {
    from: validRange ? inputFrom : addDays(to, 1 - DEFAULT_DAYS),
    to,
    shopId: params.get("shopId"),
    status: status && status in NOTIFICATION_STATUS_LABELS ? (status as NotificationOutboxStatus) : null,
    channel: channel === "email" || channel === "line" ? channel : null,
    category: category && category in NOTIFICATION_CATEGORY_LABELS ? (category as NotificationCategory) : null,
    lookup: params.get("lookup"),
  };
}
function filtersPath(filters: Partial<Filters>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params.size ? `/notifications?${params}` : "/notifications";
}
function requestParams(filters: Filters): NotificationSearchParams {
  if (filters.lookup) return { lookup: filters.lookup };
  const { from, to, shopId, status, channel, category } = filters;
  return { from, to, shopId, status, channel, category };
}

function Tile({ label, children, tone }: { label: string; children: ReactNode; tone?: "warning" }) {
  return (
    <Stack
      gap={1}
      bg={tone === "warning" ? "orange.50" : "gray.50"}
      border="1px solid"
      borderColor={tone === "warning" ? "orange.200" : "gray.200"}
      borderRadius="md"
      p={4}
    >
      <Text color="gray.700" fontSize="sm" fontWeight="bold">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

function NotificationSummary({ onShowFailed }: { onShowFailed: () => void }) {
  const query = useQuery({
    queryKey: ["analytics", "notificationSummary"],
    queryFn: ({ signal }) => fetchNotificationSummary(signal),
  });
  const data = query.data?.data;
  return (
    <Panel
      title="通知の状態"
      description={data ? `${formatDateTime(data.asOf)}時点` : "送信数、失敗、遅れを確認します。"}
    >
      {query.isPending ? (
        <Skeleton h="96px" borderRadius="md" aria-busy="true" />
      ) : !data ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }} gap={3}>
          <Tile label={`今月の送信数（${Number(data.month.month.slice(5))}月・店舗宛）`}>
            <Text fontSize="xl" fontWeight="bold">
              メール {formatCount(data.month.email)}・LINE {formatCount(data.month.line)}
            </Text>
            <Text color="gray.600" fontSize="xs">
              {formatCount(data.month.shopCount)}店舗
              {data.month.isPartial ? "・一部の店舗だけを集計" : ""}。組織宛の通知は含みません。
            </Text>
          </Tile>
          <Tile label="直近7日の送信失敗" tone={data.failedLast7Days.count > 0 ? "warning" : undefined}>
            <Text fontSize="xl" fontWeight="bold">
              {formatCount(data.failedLast7Days.count)}件{data.failedLast7Days.isPartial ? "以上" : ""}
            </Text>
            {data.failedLast7Days.count > 0 && (
              <Button alignSelf="start" size="xs" variant="outline" onClick={onShowFailed}>
                失敗した通知を表示
              </Button>
            )}
          </Tile>
          <Tile label="送信の遅れ" tone={data.delayed.pending + data.delayed.processing > 0 ? "warning" : undefined}>
            <Text fontSize="xl" fontWeight="bold">
              {data.delayed.pending + data.delayed.processing === 0
                ? "遅れなし"
                : `${formatCount(data.delayed.pending + data.delayed.processing)}件${data.delayed.isPartial ? "以上" : ""}`}
            </Text>
            <Text color="gray.600" fontSize="xs">
              予定から15分以上たった送信待ち {formatCount(data.delayed.pending)}件・処理が止まった送信中{" "}
              {formatCount(data.delayed.processing)}件
            </Text>
          </Tile>
          <Tile label="LINEの送信枠" tone={data.lineQuota?.status === "exceeded" ? "warning" : undefined}>
            {data.lineQuota ? (
              <>
                <Text fontSize="xl" fontWeight="bold">
                  {data.lineQuota.status === "exceeded"
                    ? "上限に到達"
                    : `残り${formatCount(data.lineQuota.remaining)}通`}
                </Text>
                <Text color="gray.600" fontSize="xs">
                  全体{formatCount(data.lineQuota.totalQuota)}通・{formatDateTime(data.lineQuota.checkedAt)}に確認
                </Text>
              </>
            ) : (
              <Text color="gray.600" fontSize="sm">
                まだ確認していません
              </Text>
            )}
          </Tile>
        </Grid>
      )}
    </Panel>
  );
}

function StatusCell({ row }: { row: NotificationSearchRowDto }) {
  const notes = [
    row.deliveryStatus && row.status === "sent" ? deliveryStatusLabel(row.deliveryStatus) : null,
    row.errorCode ? errorCodeLabel(row.errorCode) : null,
    row.cancelReason ? `理由：${cancelReasonLabel(row.cancelReason)}` : null,
    row.status === "pending" && row.nextRunAt !== null ? `予定：${formatDateTime(row.nextRunAt)}` : null,
    row.attemptCount > 1 ? `${row.attemptCount}回試行` : null,
    row.deliverySuppressed ? "送信を抑止する設定" : null,
    row.payloadRedacted ? "宛先・本文は保存期間後に削除済み" : null,
  ].filter((note): note is string => note !== null);
  return (
    <Stack gap={1}>
      <Badge alignSelf="start" colorPalette={NOTIFICATION_STATUS_COLORS[row.status]} variant="subtle">
        {NOTIFICATION_STATUS_LABELS[row.status]}
      </Badge>
      {notes.map((note) => (
        <Text key={note} color="gray.600" fontSize="xs">
          {note}
        </Text>
      ))}
    </Stack>
  );
}

function TargetCell({ row }: { row: NotificationSearchRowDto }) {
  const shopActive = row.shop !== null && !row.shop.isDeleted;
  const recipient =
    row.recipient.kind === "staff" ? (
      row.recipient.name && row.recipient.staffId && shopActive && row.shop ? (
        <Link href={staffPath(row.shop.shopId, row.recipient.staffId)} color="blue.700">
          {row.recipient.name}
        </Link>
      ) : (
        (row.recipient.name ?? "削除済みスタッフ")
      )
    ) : row.recipient.kind === "manager" ? (
      `管理者：${row.recipient.name ?? "確認できません"}`
    ) : row.recipient.kind === "invitation" ? (
      `招待先：${row.recipient.name ?? "確認できません"}`
    ) : null;
  return (
    <Stack gap={1} overflowWrap="anywhere">
      {row.shop ? (
        shopActive ? (
          <Link href={shopPath(row.shop.shopId)} color="blue.700" fontWeight="bold">
            {row.shop.name}
          </Link>
        ) : (
          <Text color="gray.600">削除済み店舗</Text>
        )
      ) : (
        <Text fontWeight="bold">組織宛</Text>
      )}
      {row.organizationName && (
        <Text color="gray.600" fontSize="xs">
          {row.organizationName}
        </Text>
      )}
      {recipient && <Text fontSize="sm">{recipient}</Text>}
      {row.recruitment && row.shop && (
        <Link href={cyclePath(row.shop.shopId, row.recruitment.recruitmentId)} color="blue.700" fontSize="xs">
          {formatDate(row.recruitment.periodStart)}〜{formatDate(row.recruitment.periodEnd)}の募集
        </Link>
      )}
    </Stack>
  );
}

function KindCell({ row }: { row: NotificationSearchRowDto }) {
  return (
    <Stack gap={1}>
      <Text>{NOTIFICATION_CATEGORY_LABELS[row.category]}</Text>
      <Text color="gray.600" fontSize="xs">
        {channelLabel(row.channel)}
        {row.purpose === "billing" ? "・課金" : ""}
      </Text>
      <Text color="gray.500" fontFamily="mono" fontSize="2xs" overflowWrap="anywhere">
        {row.notificationContext}
      </Text>
    </Stack>
  );
}

function TimesCell({ row }: { row: NotificationSearchRowDto }) {
  const times = [
    row.sentAt !== null ? `送信：${formatDateTime(row.sentAt)}` : null,
    row.deliveredAt !== null ? `到達：${formatDateTime(row.deliveredAt)}` : null,
    row.failedAt !== null ? `失敗：${formatDateTime(row.failedAt)}` : null,
    row.cancelledAt !== null ? `取消：${formatDateTime(row.cancelledAt)}` : null,
  ].filter((time): time is string => time !== null);
  return (
    <Stack gap={1}>
      {times.length ? times.map((time) => <Text key={time}>{time}</Text>) : <Text color="gray.600">—</Text>}
      {row.resendEmailId && (
        <Text color="gray.500" fontFamily="mono" fontSize="2xs" overflowWrap="anywhere">
          Resend：{row.resendEmailId}
        </Text>
      )}
    </Stack>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: Record<T, string>;
  onChange: (value: T | null) => void;
}) {
  return (
    <Stack gap={1} minW={{ base: "full", md: "180px" }}>
      <Text as="label" fontSize="xs" color="gray.700" fontWeight="bold">
        {label}
        <NativeSelect.Root size="sm" mt={1}>
          <NativeSelect.Field
            bg="white"
            fontSize={{ base: "md", md: "sm" }}
            value={value ?? ""}
            onChange={(event) => onChange((event.target.value || null) as T | null)}
          >
            <option value="">すべて</option>
            {(Object.entries(options) as [T, string][]).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Text>
    </Stack>
  );
}

export function NotificationsPage({ navigate }: { navigate: (path: string) => void }) {
  const filters = readFilters(window.location.search);
  const [draft, setDraft] = useState(filters);
  const [lookupInput, setLookupInput] = useState(filters.lookup ?? "");
  const rangeError =
    !draft.from || !draft.to
      ? "開始日と終了日を入力してください。"
      : draft.from > draft.to
        ? "開始日は終了日以前にしてください。"
        : addDays(draft.from, MAX_DAYS - 1) < draft.to
          ? `期間は${MAX_DAYS}日以内にしてください。`
          : null;
  const query = useInfiniteQuery({
    queryKey: ["analytics", "notifications", filters],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      let cursor = pageParam;
      let scannedCount = 0;
      const rows: NotificationSearchRowDto[] = [];
      for (let request = 0; ; request += 1) {
        const page = await fetchNotifications({ ...requestParams(filters), cursor, limit: PAGE_SIZE }, signal);
        rows.push(...page.data.rows);
        scannedCount += page.data.scannedCount;
        cursor = page.data.pageInfo.continueCursor;
        const done = page.data.pageInfo.isDone || cursor === null;
        if (done || rows.length >= MIN_ROWS_PER_LOAD || request + 1 >= AUTO_CONTINUE_REQUESTS)
          return { env: page.env, data: page.data, rows, scannedCount, nextCursor: done ? null : cursor };
      }
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const first = query.data?.pages[0];
  useReportAnalyticsEnvironment(first?.env.label);
  const rows = query.data?.pages.flatMap((page) => page.rows) ?? [];
  const scanned = query.data?.pages.reduce((sum, page) => sum + page.scannedCount, 0) ?? 0;
  const shop = first?.data.shop ?? null;
  const setDraftValue = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  return (
    <Stack gap={6}>
      <PageHeading
        title="通知"
        description="送信の状態を確認し、個別の通知を調べます。宛先のメールアドレスと本文は表示しません。"
      />
      <NotificationSummary
        onShowFailed={() => navigate(filtersPath({ from: addDays(todayJst(), -7), to: todayJst(), status: "failed" }))}
      />
      <Panel
        title="通知を検索"
        description="受付日時の新しい順に表示します。店舗で絞り込むときは、店舗詳細の「この店舗の通知を調べる」から開きます。送信済みは相手への到達を保証しません。"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (rangeError) return;
            navigate(filtersPath({ ...draft, lookup: null }));
          }}
        >
          <Stack gap={3}>
            {filters.shopId && !filters.lookup && (
              <Flex align="center" bg="gray.50" borderRadius="md" gap={3} justify="space-between" p={3} wrap="wrap">
                <Text fontSize="sm" fontWeight="bold">
                  店舗：{shop?.name ?? (query.isPending ? "読み込み中" : "確認できません")}
                </Text>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(filtersPath({ ...filters, shopId: null, lookup: null }))}
                >
                  店舗の絞り込みを解除
                </Button>
              </Flex>
            )}
            <Flex gap={3} wrap="wrap" align="end">
              <Stack gap={1}>
                <Text as="label" fontSize="xs" color="gray.700" fontWeight="bold">
                  開始日
                  <Input
                    type="date"
                    size="sm"
                    mt={1}
                    bg="white"
                    fontSize={{ base: "md", md: "sm" }}
                    value={draft.from}
                    onChange={(event) => setDraftValue("from", event.target.value)}
                  />
                </Text>
              </Stack>
              <Stack gap={1}>
                <Text as="label" fontSize="xs" color="gray.700" fontWeight="bold">
                  終了日
                  <Input
                    type="date"
                    size="sm"
                    mt={1}
                    bg="white"
                    fontSize={{ base: "md", md: "sm" }}
                    value={draft.to}
                    onChange={(event) => setDraftValue("to", event.target.value)}
                  />
                </Text>
              </Stack>
              <SelectField
                label="状態"
                value={draft.status}
                options={NOTIFICATION_STATUS_LABELS}
                onChange={(value) => setDraftValue("status", value)}
              />
              <SelectField
                label="送信方法"
                value={draft.channel}
                options={{ email: "メール", line: "LINE" }}
                onChange={(value) => setDraftValue("channel", value)}
              />
              <SelectField
                label="種別"
                value={draft.category}
                options={NOTIFICATION_CATEGORY_LABELS}
                onChange={(value) => setDraftValue("category", value)}
              />
              <Button type="submit" size="sm" disabled={rangeError !== null}>
                検索する
              </Button>
            </Flex>
            {rangeError && (
              <Text role="alert" color="red.700" fontSize="sm">
                {rangeError}
              </Text>
            )}
          </Stack>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const lookup = lookupInput.trim();
            if (lookup) navigate(filtersPath({ lookup }));
          }}
        >
          <Flex gap={2} maxW="lg" align="end">
            <Text as="label" flex="1" fontSize="xs" color="gray.700" fontWeight="bold">
              通知IDまたはResendのメールIDで探す
              <Input
                size="sm"
                mt={1}
                bg="white"
                fontSize={{ base: "md", md: "sm" }}
                maxLength={128}
                value={lookupInput}
                onChange={(event) => setLookupInput(event.target.value)}
              />
            </Text>
            <Button type="submit" size="sm" variant="outline" disabled={!lookupInput.trim()}>
              IDで探す
            </Button>
          </Flex>
        </form>
        {filters.lookup && (
          <Flex align="center" bg="gray.50" borderRadius="md" gap={3} justify="space-between" p={3} wrap="wrap">
            <Text fontSize="sm" fontWeight="bold" overflowWrap="anywhere">
              ID「{filters.lookup}」の検索結果
            </Text>
            <Button size="sm" variant="outline" onClick={() => navigate("/notifications")}>
              条件での検索に戻る
            </Button>
          </Flex>
        )}
        {query.error && <QueryError error={query.error} onRetry={() => void query.refetch()} />}
        {query.isPending ? (
          <Stack gap={3} aria-busy="true" aria-label="通知を読み込み中">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} h="64px" borderRadius="md" />
            ))}
          </Stack>
        ) : (
          query.data && (
            <>
              {!filters.lookup && (
                <Text color="gray.600" fontSize="xs">
                  {formatDate(first?.data.range?.from)}〜{formatDate(first?.data.range?.to)}（日本時間）・
                  {formatCount(scanned)}件を確認
                </Text>
              )}
              <DataTable
                rows={rows}
                getRowKey={(row) => row.id}
                emptyText={
                  filters.lookup
                    ? "このIDの通知は見つかりません。"
                    : query.hasNextPage
                      ? "確認した範囲に一致する通知はありません。続きを確認してください。"
                      : "条件に一致する通知はありません。"
                }
                columns={[
                  {
                    key: "createdAt",
                    header: "受付日時",
                    width: "170px",
                    render: (row) => (
                      <Stack gap={1}>
                        <Text>{formatDateTime(row.createdAt)}</Text>
                        <Text color="gray.500" fontFamily="mono" fontSize="2xs" overflowWrap="anywhere">
                          {row.id}
                        </Text>
                      </Stack>
                    ),
                  },
                  { key: "kind", header: "種別", width: "200px", render: (row) => <KindCell row={row} /> },
                  { key: "target", header: "店舗・宛先", render: (row) => <TargetCell row={row} /> },
                  { key: "status", header: "状態", width: "220px", render: (row) => <StatusCell row={row} /> },
                  { key: "times", header: "日時", width: "220px", render: (row) => <TimesCell row={row} /> },
                ]}
                renderMobileRow={(row) => (
                  <Stack gap={3}>
                    <Flex justify="space-between" gap={2} align="start">
                      <KindCell row={row} />
                      <Text color="gray.600" fontSize="xs" flexShrink={0}>
                        {formatDateTime(row.createdAt)}
                      </Text>
                    </Flex>
                    <TargetCell row={row} />
                    <StatusCell row={row} />
                    <Box fontSize="xs">
                      <TimesCell row={row} />
                    </Box>
                    <Text color="gray.500" fontFamily="mono" fontSize="2xs" overflowWrap="anywhere">
                      {row.id}
                    </Text>
                  </Stack>
                )}
              />
              {!filters.lookup && (
                <MoreButton
                  count={rows.length}
                  hasMore={query.hasNextPage}
                  loading={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                />
              )}
            </>
          )
        )}
      </Panel>
    </Stack>
  );
}

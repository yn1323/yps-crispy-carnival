import { Badge, Box, HStack, Stack, Text } from "@chakra-ui/react";
import { ChartPanel } from "@/components/ChartPanel";
import { PageHeading, SectionHeading } from "@/components/PageHeading";
import { hasPlottableTrendData, TrendChart } from "@/components/TrendChart";
import { routePath, withCurrentSearch } from "@/routes/appRoute";
import { AnalysisControls } from "./AnalysisControls";
import { ShopsTable } from "./AnalyticsTables";
import { analyticsEmptyText, DataStatus } from "./DataStatus";
import { formatDate } from "./format";
import { KpiGrid } from "./KpiGrid";
import { ListPagination, type PageInfoViewModel } from "./ListPagination";
import { HealthSignals } from "./Presentation";
import type { AnalyticsSearchState } from "./useAnalyticsSearch";
import type { OrganizationDetailViewModel } from "./viewModels";

const PRIMARY_KPI_KEYS = new Set(["shops", "activeShops", "staff"]);

function TrendUnavailable() {
  return (
    <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="lg" p={4}>
      <Text color="gray.700" fontSize="sm" fontWeight="bold">
        推移は2日分以上の集計後に表示されます
      </Text>
      <Text color="gray.500" fontSize="xs" mt={1}>
        描画できる値がそろうまで、空のグラフは表示しません。
      </Text>
    </Box>
  );
}

export function OrganizationDetailView({
  model,
  navigate,
  pageInfo,
  search,
  updateSearch,
}: {
  model: OrganizationDetailViewModel;
  navigate: (href: string) => void;
  pageInfo: PageInfoViewModel;
  search: AnalyticsSearchState;
  updateSearch: (patch: Partial<AnalyticsSearchState>, replace?: boolean) => void;
}) {
  const primaryKpis = model.kpis.filter((item) => PRIMARY_KPI_KEYS.has(item.key));
  const peopleKpis = model.kpis.filter((item) => !PRIMARY_KPI_KEYS.has(item.key));
  const canPlotTrend = hasPlottableTrendData(model.trend, model.trendKeys);
  const shopCountCompleteness = model.kpis.find((item) => item.key === "shops")?.completeness;
  const expansionNotApplicable =
    shopCountCompleteness === "complete" && model.shopCount !== null && model.shopCount < 2;

  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading
        breadcrumbs={[
          { href: withCurrentSearch(routePath({ name: "organizations" })), label: "グループ" },
          { label: model.displayName },
        ]}
        description="グループ内で利用状況に差がある店舗を確認します。"
        title={model.displayName}
      />
      <DataStatus metadata={model.metadata} />
      <AnalysisControls
        advancedFilterKeys={[]}
        dataStartDate={model.metadata.dataStartDate}
        helperText="期間と集計単位を変更できます。"
        search={search}
        showComparison={false}
        update={updateSearch}
        warnings={model.metadata.warnings}
      />
      <HStack gap={2} wrap="wrap">
        <Badge variant="surface">{model.plan}</Badge>
        <Badge variant="surface">登録 {formatDate(model.registeredAt)}</Badge>
      </HStack>

      <Stack gap={4}>
        <SectionHeading description="店舗数、稼働店舗数、スタッフ所属を最初に確認します。" title="グループの現在" />
        <KpiGrid items={primaryKpis} />
        <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={3} p={4}>
          <SectionHeading description="一店舗に複数の状態が同時に成立します。" title="要確認状態" />
          <HealthSignals completeness={model.healthCompleteness} signals={model.healthSignals} />
        </Stack>
        {peopleKpis.length > 0 ? (
          <Box as="details" bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" p={4}>
            <Box as="summary" cursor="pointer" fontSize="sm" fontWeight="bold">
              人員内訳を見る
            </Box>
            <Text color="gray.500" fontSize="xs" mt={2}>
              重複を除いた利用者、重複判定できないスタッフ、シフト対象、管理者の内訳です。
            </Text>
            <Box mt={4}>
              <KpiGrid items={peopleKpis} />
            </Box>
          </Box>
        ) : null}
      </Stack>

      {expansionNotApplicable ? (
        <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="lg" p={4}>
          <Text color="gray.700" fontSize="sm" fontWeight="bold">
            多店舗展開はまだ対象外です
          </Text>
          <Text color="gray.500" fontSize="xs" mt={1}>
            2店舗目の登録後に、多店舗展開の指標を表示します。
          </Text>
        </Box>
      ) : (
        <Stack gap={4}>
          <SectionHeading
            description="初店舗またはグループ登録から、2店舗目で初回シフトが確定するまでを表示します。"
            title="多店舗展開"
          />
          <KpiGrid items={model.expansionKpis} />
        </Stack>
      )}

      {canPlotTrend ? (
        <ChartPanel
          contentHeight={{ base: "240px", md: "320px" }}
          description="店舗別率の平均ではなく、完全なシフト周期の分子・分母を合算しています。"
          title="KPI推移"
        >
          <TrendChart data={model.trend} keys={model.trendKeys} valueKind="percent" />
        </ChartPanel>
      ) : (
        <TrendUnavailable />
      )}

      <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={4} p={{ base: 4, md: 5 }}>
        <SectionHeading description="導入到達、次回シフト、提出率、要確認状態を比べます。" title="グループ内の店舗" />
        <ShopsTable
          emptyText={analyticsEmptyText(model.metadata, "このグループに店舗はありません", pageInfo)}
          navigate={navigate}
          rows={model.shops}
          variant="group"
        />
        <ListPagination pageInfo={pageInfo} onNext={(cursor) => updateSearch({ cursor })} />
      </Stack>
    </Stack>
  );
}

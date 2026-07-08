import { Badge, Box, Button, Flex, HStack, Skeleton, Stack, Table, Text } from "@chakra-ui/react";
import { useState } from "react";
import type { ShopStageRowDto, ShopStagesResponse } from "@/api/analyticsTypes";
import { formatDateTime, formatNumber, formatPercent } from "@/domains/analytics/format";
import {
  getShopLineLinkedRate,
  getShopListRows,
  getShopStageColorPalette,
  getShopStageLabel,
  SHOP_LIST_STAGE_FILTERS,
  type ShopListSort,
  type ShopListStageFilter,
} from "@/domains/analytics/shopList";
import { SortableColumnHeader } from "./SortableColumnHeader";

const INITIAL_SORT: ShopListSort = { direction: "desc", key: "registeredAt" };
const INITIAL_STAGE_FILTERS = SHOP_LIST_STAGE_FILTERS.map((filter) => filter.value);

function formatNullableDateTime(value: number | null | undefined) {
  if (!value) return "-";
  return formatDateTime(value);
}

function formatRecruitmentCount(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${formatNumber(value)}件`;
}

function StageFilterButtons({
  selectedFilters,
  onToggle,
}: {
  selectedFilters: ShopListStageFilter[];
  onToggle: (filter: ShopListStageFilter) => void;
}) {
  return (
    <HStack gap={{ base: 2, md: 3 }} justify="space-around" overflowX="auto" py={1} w="full">
      {SHOP_LIST_STAGE_FILTERS.map((filter) => {
        const selected = selectedFilters.includes(filter.value);
        return (
          <Button
            key={filter.value}
            aria-pressed={selected}
            colorPalette={filter.colorPalette}
            flex="1 1 0"
            flexShrink={0}
            fontWeight="bold"
            h="38px"
            minW="92px"
            onClick={() => onToggle(filter.value)}
            px={{ base: 2, md: 4 }}
            variant={selected ? "solid" : "outline"}
          >
            {filter.label}
          </Button>
        );
      })}
    </HStack>
  );
}

function StageBadge({ stage }: { stage: ShopStageRowDto["stage"] }) {
  return (
    <Badge colorPalette={getShopStageColorPalette(stage)} variant="subtle">
      {getShopStageLabel(stage)}
    </Badge>
  );
}

export function ShopListTabContent({
  isLoading,
  onOpenShopRecruitments,
  stages,
}: {
  isLoading: boolean;
  onOpenShopRecruitments: (shopId: string) => void;
  stages: ShopStagesResponse | null;
}) {
  const [selectedFilters, setSelectedFilters] = useState<ShopListStageFilter[]>(INITIAL_STAGE_FILTERS);
  const [sort, setSort] = useState<ShopListSort>(INITIAL_SORT);
  const rows = getShopListRows(stages, selectedFilters, sort);

  const toggleFilter = (filter: ShopListStageFilter) => {
    setSelectedFilters((current) =>
      current.includes(filter) ? current.filter((value) => value !== filter) : [...current, filter],
    );
  };

  return (
    <Stack gap={{ base: 5, md: 6 }}>
      <Box>
        <Flex
          align={{ base: "stretch", md: "center" }}
          direction={{ base: "column", md: "row" }}
          gap={3}
          justify="space-between"
        >
          <Box>
            <Text color="gray.950" fontSize={{ base: "md", md: "lg" }} fontWeight="bold">
              店舗一覧
            </Text>
            <Text color="gray.500" fontSize="sm" mt={1}>
              全期間の全店舗を、現在のステージで絞り込めます
            </Text>
          </Box>
          <Text color="gray.500" fontSize="sm" fontWeight="bold">
            表示 {formatNumber(rows.length)} / {formatNumber(stages?.rows.length ?? 0)}店舗
          </Text>
        </Flex>
        <Box borderBottom="1px solid" borderColor="gray.100" mt={4}>
          <StageFilterButtons onToggle={toggleFilter} selectedFilters={selectedFilters} />
        </Box>
      </Box>

      <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" minW={0} p={{ base: 4, md: 5 }}>
        <Box overflowX="auto">
          {isLoading ? (
            <Stack gap={2}>
              <Skeleton h="40px" w="full" />
              <Skeleton h="40px" w="full" />
              <Skeleton h="40px" w="full" />
            </Stack>
          ) : (
            <Table.Root minW="1040px" size="sm" variant="outline">
              <Table.Header>
                <Table.Row bg="gray.50">
                  <SortableColumnHeader label="登録日時" onSortChange={setSort} sort={sort} sortKey="registeredAt" />
                  <SortableColumnHeader
                    defaultDirection="asc"
                    label="店舗名"
                    onSortChange={setSort}
                    sort={sort}
                    sortKey="shopName"
                    width="160px"
                  />
                  <SortableColumnHeader
                    label="スタッフ数"
                    onSortChange={setSort}
                    sort={sort}
                    sortKey="staffCount"
                    textAlign="right"
                  />
                  <SortableColumnHeader
                    label="LINE連携率"
                    onSortChange={setSort}
                    sort={sort}
                    sortKey="lineLinkedRate"
                    textAlign="right"
                  />
                  <SortableColumnHeader
                    defaultDirection="asc"
                    label="現在のステージ"
                    onSortChange={setSort}
                    sort={sort}
                    sortKey="stage"
                  />
                  <SortableColumnHeader
                    label="作成シフト数"
                    onSortChange={setSort}
                    sort={sort}
                    sortKey="recruitmentCount"
                    textAlign="right"
                  />
                  <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="right">
                    詳細
                  </Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={7}>
                      <Flex align="center" h="96px" justify="center">
                        <Text color="gray.500" fontSize="sm">
                          該当する店舗はありません
                        </Text>
                      </Flex>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  rows.map((row) => (
                    <Table.Row key={row.shopId}>
                      <Table.Cell color="gray.700">{formatNullableDateTime(row.shopCreatedAt)}</Table.Cell>
                      <Table.Cell color="gray.950" fontWeight="bold" maxW="160px" w="160px">
                        <Text
                          as="span"
                          display="block"
                          overflow="hidden"
                          textOverflow="ellipsis"
                          title={row.shopName}
                          whiteSpace="nowrap"
                        >
                          {row.shopName}
                        </Text>
                      </Table.Cell>
                      <Table.Cell color="gray.700" textAlign="right">
                        {formatNumber(row.staffCount)}人
                      </Table.Cell>
                      <Table.Cell color="gray.700" textAlign="right">
                        {formatPercent(getShopLineLinkedRate(row))}
                      </Table.Cell>
                      <Table.Cell>
                        <StageBadge stage={row.stage} />
                      </Table.Cell>
                      <Table.Cell color="gray.700" textAlign="right">
                        {formatRecruitmentCount(row.recruitmentCount)}
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <Button
                          colorPalette="blue"
                          onClick={() => onOpenShopRecruitments(row.shopId)}
                          size="xs"
                          variant="outline"
                        >
                          詳細
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          )}
        </Box>
      </Box>
    </Stack>
  );
}

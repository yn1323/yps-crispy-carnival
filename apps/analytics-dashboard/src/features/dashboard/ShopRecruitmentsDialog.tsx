import {
  Badge,
  Box,
  Dialog as ChakraDialog,
  CloseButton,
  Flex,
  Portal,
  Skeleton,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import type { ShopRecruitmentRowDto, ShopRecruitmentsResponse } from "@/api/analyticsTypes";
import { formatNumber } from "@/domains/analytics/format";
import { type SortState, sortRowsBy } from "@/domains/analytics/tableSort";
import { SortableColumnHeader } from "./SortableColumnHeader";

type RecruitmentSortKey = "status" | "period" | "submittedCount";

const INITIAL_RECRUITMENT_SORT: SortState<RecruitmentSortKey> = {
  direction: "desc",
  key: "period",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${year}/${month}/${day}`;
}

function formatPeriod(start: string, end: string) {
  return `${formatDate(start)} 〜 ${formatDate(end)}`;
}

function statusLabel(status: ShopRecruitmentRowDto["status"]) {
  return status === "confirmed" ? "確定済み" : "募集中";
}

function statusColorPalette(status: ShopRecruitmentRowDto["status"]) {
  return status === "confirmed" ? "green" : "orange";
}

function formatSubmittedCount(row: ShopRecruitmentRowDto) {
  if (row.submittedCount === null) return "-";
  if (row.activeStaffCountSnapshot === null) return `${formatNumber(row.submittedCount)}人`;
  return `${formatNumber(row.submittedCount)} / ${formatNumber(row.activeStaffCountSnapshot)}人`;
}

function dateStringToSortableDay(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function recruitmentSortValue(row: ShopRecruitmentRowDto, key: RecruitmentSortKey) {
  switch (key) {
    case "status":
      return statusLabel(row.status);
    case "period":
      return dateStringToSortableDay(row.periodStart);
    case "submittedCount":
      return row.submittedCount;
  }
}

function sortRecruitmentRows(rows: ShopRecruitmentRowDto[], sort: SortState<RecruitmentSortKey>) {
  return sortRowsBy(rows, sort, recruitmentSortValue, (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function ShopRecruitmentsDialog({
  data,
  errorMessage,
  isLoading,
  isOpen,
  onClose,
  shopName,
}: {
  data: ShopRecruitmentsResponse | null;
  errorMessage: string | null;
  isLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  shopName: string;
}) {
  const [sort, setSort] = useState<SortState<RecruitmentSortKey>>(INITIAL_RECRUITMENT_SORT);
  const rows = sortRecruitmentRows(data?.rows ?? [], sort);
  return (
    <ChakraDialog.Root
      open={isOpen}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      placement="center"
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content maxH="calc(100dvh - 48px)" maxW="780px">
            <ChakraDialog.Header>
              <ChakraDialog.Title>{shopName} のシフト</ChakraDialog.Title>
            </ChakraDialog.Header>
            <ChakraDialog.Body overflowY="auto">
              {errorMessage ? (
                <Box bg="red.50" border="1px solid" borderColor="red.100" borderRadius="md" color="red.700" p={3}>
                  <Text fontSize="sm" fontWeight="bold">
                    {errorMessage}
                  </Text>
                </Box>
              ) : isLoading ? (
                <Stack gap={2}>
                  <Skeleton h="44px" w="full" />
                  <Skeleton h="44px" w="full" />
                  <Skeleton h="44px" w="full" />
                </Stack>
              ) : rows.length === 0 ? (
                <Flex align="center" bg="gray.50" borderRadius="md" h="112px" justify="center">
                  <Text color="gray.500" fontSize="sm">
                    作成されたシフトはありません
                  </Text>
                </Flex>
              ) : (
                <Box overflowX="auto">
                  <Table.Root minW="560px" size="sm" variant="outline">
                    <Table.Header>
                      <Table.Row bg="gray.50">
                        <SortableColumnHeader
                          defaultDirection="asc"
                          label="ステータス"
                          onSortChange={setSort}
                          sort={sort}
                          sortKey="status"
                        />
                        <SortableColumnHeader label="期間" onSortChange={setSort} sort={sort} sortKey="period" />
                        <SortableColumnHeader
                          label="提出人数"
                          onSortChange={setSort}
                          sort={sort}
                          sortKey="submittedCount"
                          textAlign="right"
                        />
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {rows.map((row) => (
                        <Table.Row key={row.recruitmentId}>
                          <Table.Cell>
                            <Badge colorPalette={statusColorPalette(row.status)} variant="subtle">
                              {statusLabel(row.status)}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell color="gray.700" fontWeight="medium">
                            {formatPeriod(row.periodStart, row.periodEnd)}
                          </Table.Cell>
                          <Table.Cell color="gray.700" textAlign="right">
                            {formatSubmittedCount(row)}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                </Box>
              )}
            </ChakraDialog.Body>
            <ChakraDialog.CloseTrigger asChild insetEnd="2" position="absolute" top="2">
              <CloseButton aria-label="閉じる" size="sm" />
            </ChakraDialog.CloseTrigger>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

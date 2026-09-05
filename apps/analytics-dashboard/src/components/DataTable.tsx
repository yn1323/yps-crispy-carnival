import { Box, Button, Flex, NativeSelect, Stack, Table, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  width?: string;
  sortable?: boolean;
  render: (row: T) => ReactNode;
};

export type DataTableSort = { key: string; direction: "asc" | "desc" };

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyText?: string;
  getRowHref?: (row: T) => string;
  getRowLabel?: (row: T) => string;
  onNavigate?: (href: string) => void;
  renderMobileRow?: (row: T) => ReactNode;
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyText = "この期間のデータはありません",
  getRowHref,
  getRowLabel,
  onNavigate,
  renderMobileRow,
  sort,
  onSortChange,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <Box bg="gray.50" borderRadius="md" p={5}>
        <Text color="gray.500" fontSize="sm">
          {emptyText}
        </Text>
      </Box>
    );
  }

  const openRow = (href: string) => {
    if (onNavigate) onNavigate(href);
    else window.location.assign(href);
  };
  const nextDirection = (key: string) => (sort?.key === key && sort.direction === "asc" ? "desc" : "asc");

  return (
    <>
      {renderMobileRow && sort && onSortChange && (
        <Flex display={{ base: "flex", lg: "none" }} align="center" gap={2}>
          <Text fontSize="sm" flexShrink={0}>
            並び順
          </Text>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              aria-label="並べ替える項目"
              value={sort.key}
              onChange={(event) => onSortChange({ key: event.target.value, direction: "asc" })}
            >
              {columns
                .filter((column) => column.sortable)
                .map((column) => (
                  <option key={column.key} value={column.key}>
                    {column.header}
                  </option>
                ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSortChange({ ...sort, direction: nextDirection(sort.key) })}
            aria-label={`${sort.direction === "asc" ? "降順" : "昇順"}に並べ替え`}
          >
            {sort.direction === "asc" ? "昇順 ↑" : "降順 ↓"}
          </Button>
        </Flex>
      )}
      {renderMobileRow ? (
        <Stack display={{ base: "flex", lg: "none" }} gap={3}>
          {rows.map((row) => {
            const href = getRowHref?.(row);
            return (
              <Box
                key={getRowKey(row)}
                aria-label={href ? `${getRowLabel?.(row) ?? "選択した項目"}の詳細を開く` : undefined}
                bg="white"
                border="1px solid"
                borderColor="gray.200"
                borderRadius="md"
                cursor={href ? "pointer" : undefined}
                onClick={
                  href
                    ? (event) => {
                        if (event.target instanceof Element && event.target.closest("a, button")) return;
                        openRow(href);
                      }
                    : undefined
                }
                onKeyDown={
                  href
                    ? (event) => {
                        if (event.target instanceof Element && event.target.closest("a, button")) return;
                        if (event.key === "Enter") openRow(href);
                      }
                    : undefined
                }
                p={4}
                role={href ? "link" : undefined}
                tabIndex={href ? 0 : undefined}
                _focusVisible={href ? { outline: "2px solid", outlineColor: "blue.500" } : undefined}
                _hover={href ? { bg: "gray.50", borderColor: "gray.300" } : undefined}
              >
                {renderMobileRow(row)}
              </Box>
            );
          })}
        </Stack>
      ) : null}
      <Box
        display={{ base: renderMobileRow ? "none" : "block", lg: "block" }}
        h="full"
        minW={0}
        overflowX="auto"
        overscrollBehaviorX="contain"
      >
        <Table.Root size="sm" tableLayout={renderMobileRow ? "fixed" : undefined} w="full">
          <Table.Header>
            <Table.Row bg="gray.50">
              {columns.map((column) => (
                <Table.ColumnHeader
                  key={column.key}
                  bg="gray.50"
                  color="gray.600"
                  fontWeight="bold"
                  position="sticky"
                  textAlign={column.align}
                  top={0}
                  w={column.width}
                  whiteSpace="normal"
                  zIndex={1}
                  aria-sort={
                    column.sortable && onSortChange
                      ? sort?.key === column.key
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                      : undefined
                  }
                >
                  {column.sortable && onSortChange ? (
                    <Button
                      variant="plain"
                      size="sm"
                      px={0}
                      color="inherit"
                      fontWeight="inherit"
                      whiteSpace="normal"
                      onClick={() => onSortChange({ key: column.key, direction: nextDirection(column.key) })}
                      aria-label={`${column.header}を${nextDirection(column.key) === "asc" ? "昇順" : "降順"}に並べ替え`}
                    >
                      {column.header}
                      <Box as="span" aria-hidden="true" flexShrink={0}>
                        {sort?.key === column.key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
                      </Box>
                    </Button>
                  ) : (
                    column.header
                  )}
                </Table.ColumnHeader>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => {
              const href = getRowHref?.(row);
              return (
                <Table.Row
                  key={getRowKey(row)}
                  aria-label={href ? `${getRowLabel?.(row) ?? "選択した行"}の詳細を開く` : undefined}
                  cursor={href ? "pointer" : undefined}
                  onClick={
                    href
                      ? (event) => {
                          if (event.target instanceof Element && event.target.closest("a, button")) return;
                          openRow(href);
                        }
                      : undefined
                  }
                  onKeyDown={
                    href
                      ? (event) => {
                          if (event.target instanceof Element && event.target.closest("a, button")) return;
                          if (event.key === "Enter") {
                            openRow(href);
                          }
                        }
                      : undefined
                  }
                  role={href ? "link" : undefined}
                  tabIndex={href ? 0 : undefined}
                  _hover={href ? { bg: "gray.50" } : undefined}
                  _focusVisible={
                    href ? { outline: "2px solid", outlineColor: "blue.500", outlineOffset: "-2px" } : undefined
                  }
                >
                  {columns.map((column) => (
                    <Table.Cell
                      key={column.key}
                      lineHeight="1.6"
                      textAlign={column.align}
                      verticalAlign="top"
                      w={column.width}
                      whiteSpace="normal"
                    >
                      {column.render(row)}
                    </Table.Cell>
                  ))}
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </Box>
    </>
  );
}

import { Box, Table, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyText?: string;
  getRowHref?: (row: T) => string;
  getRowLabel?: (row: T) => string;
  onNavigate?: (href: string) => void;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyText = "この期間のデータはありません",
  getRowHref,
  getRowLabel,
  onNavigate,
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

  return (
    <Box h="full" minW={0} overflow="auto" overscrollBehavior="contain">
      <Table.Root minW="640px" size="sm">
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
                whiteSpace="nowrap"
                zIndex={1}
              >
                {column.header}
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
                        if (onNavigate) onNavigate(href);
                        else window.location.assign(href);
                      }
                    : undefined
                }
                onKeyDown={
                  href
                    ? (event) => {
                        if (event.key === "Enter") {
                          if (onNavigate) onNavigate(href);
                          else window.location.assign(href);
                        }
                      }
                    : undefined
                }
                role={href ? "link" : undefined}
                tabIndex={href ? 0 : undefined}
                _hover={href ? { bg: "blue.50" } : undefined}
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
                    whiteSpace={column.align ? "nowrap" : "normal"}
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
  );
}

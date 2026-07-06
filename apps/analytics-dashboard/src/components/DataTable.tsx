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
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyText = "この期間のデータはありません",
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
          {rows.map((row) => (
            <Table.Row key={getRowKey(row)}>
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
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}

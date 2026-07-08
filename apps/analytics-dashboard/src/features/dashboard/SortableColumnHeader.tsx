import { Button, HStack, Icon, Table, Text } from "@chakra-ui/react";
import { LuArrowDown, LuArrowUp, LuArrowUpDown } from "react-icons/lu";
import { nextSort, type SortDirection, type SortState } from "@/domains/analytics/tableSort";

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <Icon as={LuArrowUpDown} boxSize={3.5} color="gray.400" />;
  return <Icon as={direction === "asc" ? LuArrowUp : LuArrowDown} boxSize={3.5} color="blue.500" />;
}

export function SortableColumnHeader<Key extends string>({
  defaultDirection = "desc",
  label,
  onSortChange,
  sort,
  sortKey,
  textAlign,
  width,
}: {
  defaultDirection?: SortDirection;
  label: string;
  onSortChange: (sort: SortState<Key>) => void;
  sort: SortState<Key>;
  sortKey: Key;
  textAlign?: "left" | "right";
  width?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign={textAlign} w={width}>
      <Button
        aria-label={`${label}で並び替え`}
        color={active ? "blue.600" : "gray.600"}
        h="auto"
        justifyContent={textAlign === "right" ? "flex-end" : "flex-start"}
        minW={0}
        onClick={() => onSortChange(nextSort(sort, sortKey, defaultDirection))}
        px={0}
        py={1}
        variant="ghost"
        w="full"
      >
        <HStack gap={1.5} justify={textAlign === "right" ? "end" : "start"} w="full">
          <Text as="span" fontSize="sm" fontWeight="bold">
            {label}
          </Text>
          <SortIcon active={active} direction={sort.direction} />
        </HStack>
      </Button>
    </Table.ColumnHeader>
  );
}

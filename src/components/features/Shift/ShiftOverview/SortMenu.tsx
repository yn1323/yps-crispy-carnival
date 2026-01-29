import { Box, Flex, Icon, Menu, Portal, Text } from "@chakra-ui/react";
import { LuArrowUpDown, LuCheck } from "react-icons/lu";
import { SORT_MODE_LABELS } from "./constants";
import type { OverviewSortMode, SortMenuProps } from "./types";

const SORT_OPTIONS: { value: OverviewSortMode; label: string }[] = [
  { value: "default", label: SORT_MODE_LABELS.default },
  { value: "name", label: SORT_MODE_LABELS.name },
  { value: "totalHours", label: SORT_MODE_LABELS.totalHours },
];

export const SortMenu = ({ sortMode, onSortChange }: SortMenuProps) => (
  <Menu.Root positioning={{ placement: "bottom-start" }}>
    <Menu.Trigger asChild>
      <Box
        as="button"
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        cursor="pointer"
        w="full"
        _hover={{ bg: "gray.100" }}
        transition="all 0.15s"
        borderRadius="sm"
        px={1}
        py={0.5}
      >
        <Text fontWeight="bold" fontSize="xs">
          スタッフ
        </Text>
        <Icon as={LuArrowUpDown} boxSize={3} color="gray.400" />
      </Box>
    </Menu.Trigger>
    <Portal>
      <Menu.Positioner>
        <Menu.Content minW="160px">
          {SORT_OPTIONS.map((option) => (
            <Menu.Item key={option.value} value={option.value} onClick={() => onSortChange(option.value)}>
              <Flex align="center" gap={2} w="full">
                <Box w={4}>{sortMode === option.value && <Icon as={LuCheck} boxSize={4} />}</Box>
                {option.label}
              </Flex>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Positioner>
    </Portal>
  </Menu.Root>
);

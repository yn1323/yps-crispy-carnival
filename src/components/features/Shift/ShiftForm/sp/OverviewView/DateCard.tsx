import { Box, Flex, IconButton, Text, VStack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useMemo } from "react";
import { LuPlus } from "react-icons/lu";
import type { ShiftData, StaffType } from "../../types";
import { getDailyShiftTime } from "../../utils/calculations";
import { isSaturday, isSunday } from "../../utils/dateUtils";

type DateCardProps = {
  date: string;
  staffs: StaffType[];
  shifts: ShiftData[];
  isHoliday: boolean;
  onTap: () => void;
  hasNonWorkingStaffs: boolean;
  onAddStaffClick: () => void;
  isReadOnly?: boolean;
};

const MAX_VISIBLE_STAFFS = 5;

const getDateColor = (date: string, holiday: boolean) => {
  if (holiday || isSunday(date)) return "red.500";
  if (isSaturday(date)) return "blue.500";
  return "gray.800";
};

export const DateCard = ({
  date,
  staffs,
  shifts,
  isHoliday: holiday,
  onTap,
  hasNonWorkingStaffs,
  onAddStaffClick,
  isReadOnly = false,
}: DateCardProps) => {
  const dateLabel = dayjs(date).format("M/D(ddd)");
  const dateColor = getDateColor(date, holiday);

  const workingStaffs = useMemo(
    () =>
      staffs
        .map((staff) => {
          const shift = shifts.find((s) => s.staffId === staff.id);
          if (!shift || shift.positions.length === 0) return null;
          const time = getDailyShiftTime(shift);
          return { staff, time };
        })
        .filter((v) => v !== null),
    [staffs, shifts],
  );

  const visibleStaffs = workingStaffs.slice(0, MAX_VISIBLE_STAFFS);
  const hiddenCount = workingStaffs.length - MAX_VISIBLE_STAFFS;
  const staffCount = workingStaffs.length;

  return (
    <Box
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      p={3}
      bg="white"
      cursor="pointer"
      _active={{ bg: "gray.50" }}
      onClick={onTap}
    >
      {/* ヘッダー: 日付 + 追加ボタン */}
      <Flex justify="space-between" align="center" mb={2}>
        <Text fontSize="md" fontWeight="bold" color={dateColor}>
          {dateLabel}
        </Text>
        {!isReadOnly && hasNonWorkingStaffs && (
          <IconButton
            aria-label="スタッフを追加"
            size="xs"
            variant="solid"
            colorPalette="blue"
            onClick={(e) => {
              e.stopPropagation();
              onAddStaffClick();
            }}
          >
            <LuPlus />
          </IconButton>
        )}
      </Flex>

      {/* スタッフリスト */}
      <VStack gap={1} align="stretch">
        {visibleStaffs.map(({ staff, time }) => (
          <Flex key={staff.id} justify="space-between" align="center">
            <Text fontSize="sm" color="gray.700" truncate maxW="60%">
              {staff.name}
            </Text>
            <Text fontSize="sm" color="gray.500">
              {time ? `${time.start}-${time.end}` : ""}
            </Text>
          </Flex>
        ))}
        {hiddenCount > 0 && (
          <Text fontSize="xs" color="gray.400">
            他 {hiddenCount}名
          </Text>
        )}
        {staffCount === 0 && (
          <Text fontSize="xs" color="gray.400" textAlign="center" py={1}>
            出勤者なし
          </Text>
        )}
      </VStack>
    </Box>
  );
};

import { Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { LuChevronRight, LuTriangleAlert } from "react-icons/lu";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import type { ShiftData, StaffType } from "../../types";
import { formatDateWithWeekday } from "../../utils/dateUtils";

type StaffAddSheetProps = {
  staffs: StaffType[];
  shifts: ShiftData[];
  selectedDate: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onSelectStaff: (staffId: string) => void;
};

export const StaffAddSheet = ({
  staffs,
  shifts,
  selectedDate,
  isOpen,
  onOpenChange,
  onSelectStaff,
}: StaffAddSheetProps) => {
  const dateLabel = formatDateWithWeekday(selectedDate);

  return (
    <BottomSheet title={`${dateLabel} シフトなしスタッフ一覧`} isOpen={isOpen} onOpenChange={onOpenChange}>
      <VStack gap={0} align="stretch">
        {staffs.map((staff) => {
          const shift = shifts.find((s) => s.staffId === staff.id);
          const isUnsubmitted = !staff.isSubmitted;
          const hasRequest = shift?.requestedTime !== null && shift?.requestedTime !== undefined;

          const statusLabel = (() => {
            if (isUnsubmitted) return "未提出";
            if (!hasRequest) return "希望なし";
            return `希望 ${shift?.requestedTime?.start}-${shift?.requestedTime?.end}`;
          })();

          return (
            <Flex
              key={staff.id}
              align="center"
              justify="space-between"
              py={3}
              px={1}
              borderBottomWidth="1px"
              borderColor="gray.100"
              cursor="pointer"
              _active={{ bg: "gray.50" }}
              onClick={() => onSelectStaff(staff.id)}
            >
              <Flex align="center" gap={2}>
                {isUnsubmitted && <Icon as={LuTriangleAlert} color="orange.400" boxSize={4} />}
                <Text fontSize="sm" color="gray.800">
                  {staff.name}
                </Text>
              </Flex>
              <Flex align="center" gap={1}>
                <Text fontSize="xs" color={isUnsubmitted ? "orange.400" : "gray.500"}>
                  {statusLabel}
                </Text>
                <Icon as={LuChevronRight} color="gray.400" boxSize={4} />
              </Flex>
            </Flex>
          );
        })}
        {staffs.length === 0 && (
          <Text fontSize="sm" color="gray.400" textAlign="center" py={4}>
            追加できるスタッフがいません
          </Text>
        )}
      </VStack>
    </BottomSheet>
  );
};

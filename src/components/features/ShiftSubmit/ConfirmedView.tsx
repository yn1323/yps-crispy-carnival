import { Badge, Box, Center, Heading, Icon, Text, VStack } from "@chakra-ui/react";
import dayjs from "dayjs";
import "dayjs/locale/ja";
import { LuCalendarCheck } from "react-icons/lu";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import {
  generateDateRange,
  mergeAssignments,
  parseTimeRange,
  transformPositions,
  transformShiftRequests,
  transformStaffs,
} from "@/src/components/features/Shift/utils/transformRecruitmentData";

dayjs.locale("ja");

type ConfirmedViewProps = {
  staff: { _id: string; displayName: string };
  shop: { shopName: string; timeUnit: number; openTime: string; closeTime: string };
  recruitment: { _id: string; startDate: string; endDate: string };
  positions: { _id: string; name: string; color?: string; order: number }[];
  staffs: { _id: string; displayName: string; status: string }[];
  shiftRequests: {
    _id: string;
    staffId: string;
    entries: { date: string; isAvailable: boolean; startTime?: string; endTime?: string }[];
  }[];
  shiftAssignment: {
    assignments: {
      staffId: string;
      date: string;
      positions: { positionId: string; positionName: string; color: string; start: string; end: string }[];
    }[];
  } | null;
};

export const ConfirmedView = ({
  staff,
  shop,
  recruitment,
  positions,
  staffs,
  shiftRequests,
  shiftAssignment,
}: ConfirmedViewProps) => {
  const dates = generateDateRange(recruitment.startDate, recruitment.endDate);
  const timeRange = parseTimeRange(shop);
  const transformedStaffs = transformStaffs({ staffList: staffs, shiftRequests });
  const transformedPositions = transformPositions(positions);
  const baseShifts = transformShiftRequests({ shiftRequests, staffList: staffs, positions: transformedPositions });
  const allShifts = mergeAssignments({ baseShifts, assignments: shiftAssignment, staffList: staffs });

  return (
    <Center minH="100vh" bg="gray.50" p={4}>
      <Box maxW="4xl" w="full">
        {/* ヘッダー */}
        <VStack gap={3} mb={6} align="center">
          <Center bg="teal.100" p={3} borderRadius="full">
            <Icon as={LuCalendarCheck} boxSize={6} color="teal.600" />
          </Center>
          <VStack gap={1}>
            <Heading size="md">{shop.shopName}</Heading>
            <Text fontSize="lg" fontWeight="bold">
              確定シフト
            </Text>
            <Badge colorPalette="blue">確定済み</Badge>
          </VStack>
          <Box bg="white" p={3} borderRadius="md" w="full" shadow="xs">
            <VStack gap={1} align="stretch" fontSize="sm">
              <Text>
                <Text as="span" fontWeight="bold">
                  期間:
                </Text>{" "}
                {dayjs(recruitment.startDate).format("M/D(ddd)")} 〜 {dayjs(recruitment.endDate).format("M/D(ddd)")}
              </Text>
              <Text>
                <Text as="span" fontWeight="bold">
                  {staff.displayName}
                </Text>{" "}
                さん
              </Text>
            </VStack>
          </Box>
        </VStack>

        {/* ShiftForm 読み取り専用 */}
        <ShiftForm
          shopId=""
          staffs={transformedStaffs}
          positions={transformedPositions}
          initialShifts={allShifts}
          dates={dates}
          timeRange={timeRange}
          isReadOnly
          currentStaffId={staff._id}
          initialViewMode="overview"
          initialSortMode="request"
        />
      </Box>
    </Center>
  );
};

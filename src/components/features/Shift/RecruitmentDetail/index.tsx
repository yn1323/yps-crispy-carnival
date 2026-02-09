import { Badge, Box, Button, Flex, HStack } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { LuCheck, LuLock } from "react-icons/lu";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import type { PositionType, ShiftData, StaffType, TimeRange } from "@/src/components/features/Shift/ShiftForm/types";
import { toaster } from "@/src/components/ui/toaster";

type RecruitmentDetailProps = {
  shopId: string;
  recruitmentId: string;
  staffs: StaffType[];
  positions: PositionType[];
  shifts: ShiftData[];
  dates: string[];
  timeRange: TimeRange;
  holidays: string[];
};

export const RecruitmentDetail = ({
  shopId,
  recruitmentId,
  staffs,
  positions,
  shifts,
  dates,
  timeRange,
  holidays,
}: RecruitmentDetailProps) => {
  const navigate = useNavigate();

  const submittedCount = staffs.filter((s) => s.isSubmitted).length;
  const unsubmittedCount = staffs.length - submittedCount;

  const handleCloseRecruitment = () => {
    // TODO: useMutation呼び出し
    console.log("募集を締め切る:", recruitmentId);
    toaster.create({
      description: "募集を締め切りました",
      type: "success",
    });
  };

  const handleGoToConfirm = () => {
    navigate({
      to: "/shops/$shopId/shifts/recruitments/$recruitmentId/confirm",
      params: { shopId, recruitmentId },
    });
  };

  return (
    <Box>
      {/* 提出状況 + アクションボタン */}
      <Flex
        px={4}
        py={3}
        gap={3}
        direction={{ base: "column", sm: "row" }}
        justify="space-between"
        align={{ base: "stretch", sm: "center" }}
      >
        <HStack gap={3}>
          <Badge colorPalette="teal" size="lg">
            提出済み {submittedCount}名
          </Badge>
          <Badge colorPalette="gray" size="lg">
            未提出 {unsubmittedCount}名
          </Badge>
        </HStack>
        <HStack gap={2}>
          <Button variant="outline" colorPalette="orange" size="sm" onClick={handleCloseRecruitment}>
            <LuLock />
            募集を締め切る
          </Button>
          <Button colorPalette="teal" size="sm" onClick={handleGoToConfirm}>
            <LuCheck />
            シフト確定へ
          </Button>
        </HStack>
      </Flex>

      {/* ShiftForm: 一覧モード固定、readOnly、シフト希望順 */}
      <ShiftForm
        shopId={shopId}
        staffs={staffs}
        positions={positions}
        initialShifts={shifts}
        dates={dates}
        timeRange={timeRange}
        holidays={holidays}
        isReadOnly
        initialViewMode="overview"
        hideViewSwitcher
        initialSortMode="request"
      />
    </Box>
  );
};

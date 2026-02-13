import { Badge, Box, Button, Card, Container, Flex, Heading, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import "dayjs/locale/ja";
import { LuCalendar, LuCheck, LuLock } from "react-icons/lu";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import type { PositionType, ShiftData, StaffType, TimeRange } from "@/src/components/features/Shift/ShiftForm/types";
import { Animation } from "@/src/components/templates/Animation";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";

dayjs.locale("ja");

const formatDateRange = (startDate: string, endDate: string) => {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  return `${start.format("M/D(ddd)")} 〜 ${end.format("M/D(ddd)")}`;
};

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

  const dateRangeLabel = dates.length > 0 ? formatDateRange(dates[0], dates[dates.length - 1]) : "";

  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title
        prev={{ url: `/shops/${shopId}/shifts`, label: "シフト管理に戻る" }}
        action={
          <HStack gap={2} display={{ base: "none", md: "flex" }}>
            <Button variant="outline" colorPalette="orange" size="sm" onClick={handleCloseRecruitment}>
              <LuLock />
              募集を締め切る
            </Button>
            <Button colorPalette="teal" size="sm" onClick={handleGoToConfirm}>
              <LuCheck />
              シフト確定へ
            </Button>
          </HStack>
        }
      >
        <Flex align="center" gap={3}>
          <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
            <Icon as={LuCalendar} boxSize={6} color="teal.600" />
          </Flex>
          <Box>
            <Heading as="h2" size="xl" color="gray.900">
              シフト募集詳細
            </Heading>
            {dateRangeLabel && (
              <Text fontSize="sm" color="gray.500">
                {dateRangeLabel}
              </Text>
            )}
          </Box>
        </Flex>
      </Title>

      <Animation>
        {/* 提出状況サマリー */}
        <Card.Root borderWidth={0} shadow="sm" mb={4}>
          <Card.Body p={{ base: 3, md: 4 }}>
            <HStack gap={3}>
              <Badge colorPalette="teal" size="lg">
                提出済み {submittedCount}名
              </Badge>
              <Badge colorPalette="gray" size="lg">
                未提出 {unsubmittedCount}名
              </Badge>
            </HStack>
          </Card.Body>
        </Card.Root>

        {/* モバイル用アクションボタン */}
        <Box display={{ base: "block", md: "none" }} mb={4}>
          <VStack gap={2}>
            <Button w="full" variant="outline" colorPalette="orange" onClick={handleCloseRecruitment}>
              <LuLock />
              募集を締め切る
            </Button>
            <Button w="full" colorPalette="teal" onClick={handleGoToConfirm}>
              <LuCheck />
              シフト確定へ
            </Button>
          </VStack>
        </Box>

        {/* ShiftForm: 一覧モード固定、readOnly、シフト希望順 */}
        <Card.Root borderWidth={0} shadow="sm" overflow="hidden">
          <Card.Body p={{ base: 0, md: 2 }}>
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
          </Card.Body>
        </Card.Root>
      </Animation>
    </Container>
  );
};

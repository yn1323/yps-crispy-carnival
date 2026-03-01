import { Badge, Box, Button, Card, Container, Flex, Heading, HStack, Icon, Text } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import dayjs from "dayjs";
import "dayjs/locale/ja";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { LuCalendar, LuPencilLine } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import type { PositionType, ShiftData, StaffType, TimeRange } from "@/src/components/features/Shift/ShiftForm/types";
import { Animation } from "@/src/components/templates/Animation";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import { userAtom } from "@/src/stores/user";

dayjs.locale("ja");

const formatDateRange = (startDate: string, endDate: string) => {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  return `${start.format("M/D(ddd)")} 〜 ${end.format("M/D(ddd)")}`;
};

const STATUS_BADGE = {
  open: { colorPalette: "green", label: "募集中" },
  closed: { colorPalette: "orange", label: "締切済み" },
  confirmed: { colorPalette: "blue", label: "確定済み" },
} as const;

type RecruitmentDetailProps = {
  shopId: string;
  recruitmentId: string;
  recruitmentStatus: "open" | "closed" | "confirmed";
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
  recruitmentStatus,
  staffs,
  positions,
  shifts,
  dates,
  timeRange,
  holidays,
}: RecruitmentDetailProps) => {
  const navigate = useNavigate();
  const user = useAtomValue(userAtom);
  const closeMutation = useMutation(api.recruitment.mutations.close);
  const closeDialog = useDialog();
  const [isClosing, setIsClosing] = useState(false);

  const submittedCount = staffs.filter((s) => s.isSubmitted).length;
  const unsubmittedCount = staffs.length - submittedCount;

  const navigateToConfirm = () => {
    navigate({
      to: "/shops/$shopId/shifts/recruitments/$recruitmentId/confirm",
      params: { shopId, recruitmentId },
    });
  };

  const handleClose = async () => {
    if (!user.authId) return;
    setIsClosing(true);
    try {
      await closeMutation({
        recruitmentId: recruitmentId as Id<"recruitments">,
        authId: user.authId,
      });
      closeDialog.close();
      toaster.create({ description: "募集を締め切りました", type: "success" });
      navigateToConfirm();
    } catch {
      toaster.create({ description: "締め切りに失敗しました", type: "error" });
    } finally {
      setIsClosing(false);
    }
  };

  const dateRangeLabel = dates.length > 0 ? formatDateRange(dates[0], dates[dates.length - 1]) : "";
  const badge = STATUS_BADGE[recruitmentStatus];

  const actionButton =
    recruitmentStatus === "open" ? (
      <HStack gap={2}>
        <Button variant="outline" size="sm" onClick={navigateToConfirm}>
          <LuPencilLine />
          編集する
        </Button>
        <Button colorPalette="orange" size="sm" onClick={closeDialog.open}>
          締め切る
        </Button>
      </HStack>
    ) : (
      <Button colorPalette="teal" size="sm" onClick={navigateToConfirm}>
        <LuPencilLine />
        編集する
      </Button>
    );

  const mobileActionButton =
    recruitmentStatus === "open" ? (
      <Flex gap={2} mb={4}>
        <Button flex={1} variant="outline" onClick={navigateToConfirm}>
          <LuPencilLine />
          編集する
        </Button>
        <Button flex={1} colorPalette="orange" onClick={closeDialog.open}>
          締め切る
        </Button>
      </Flex>
    ) : (
      <Button w="full" colorPalette="teal" onClick={navigateToConfirm} mb={4}>
        <LuPencilLine />
        編集する
      </Button>
    );

  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title
        prev={{ url: `/shops/${shopId}/shifts`, label: "シフト管理に戻る" }}
        action={<Box display={{ base: "none", md: "flex" }}>{actionButton}</Box>}
      >
        <Flex align="center" gap={3}>
          <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
            <Icon as={LuCalendar} boxSize={6} color="teal.600" />
          </Flex>
          <Box>
            <HStack gap={2}>
              <Heading as="h2" size="xl" color="gray.900">
                シフト募集詳細
              </Heading>
              <Badge colorPalette={badge.colorPalette}>{badge.label}</Badge>
            </HStack>
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
        <Box display={{ base: "block", md: "none" }}>{mobileActionButton}</Box>

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
      </Animation>

      {/* 締切確認ダイアログ */}
      <Dialog
        title="募集を締め切りますか？"
        isOpen={closeDialog.isOpen}
        onOpenChange={closeDialog.onOpenChange}
        onSubmit={handleClose}
        submitLabel="締め切る"
        submitColorPalette="orange"
        onClose={closeDialog.close}
        isLoading={isClosing}
        role="alertdialog"
      >
        <Text>締め切ると、スタッフは新たにシフト希望を提出できなくなります。</Text>
      </Dialog>
    </Container>
  );
};

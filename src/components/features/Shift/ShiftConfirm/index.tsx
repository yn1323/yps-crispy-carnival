import { Badge, Box, Button, Container, Flex, Heading, HStack, Icon, Text } from "@chakra-ui/react";
import { useMutation } from "convex/react";
import dayjs from "dayjs";
import "dayjs/locale/ja";
import { useAtomValue } from "jotai";
import { useCallback, useRef, useState } from "react";
import { LuCalendar, LuCheck, LuSave } from "react-icons/lu";
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

const STATUS_BADGE = {
  open: { colorPalette: "green", label: "募集中" },
  closed: { colorPalette: "orange", label: "締切済み" },
  confirmed: { colorPalette: "blue", label: "確定済み" },
} as const;

type ShiftConfirmProps = {
  shopId: string;
  recruitmentId: string;
  recruitmentStatus: "open" | "closed" | "confirmed";
  staffs: StaffType[];
  positions: PositionType[];
  initialShifts: ShiftData[];
  dates: string[];
  timeRange: TimeRange;
  holidays: string[];
};

export const ShiftConfirm = ({
  shopId,
  recruitmentId,
  recruitmentStatus,
  staffs,
  positions,
  initialShifts,
  dates,
  timeRange,
  holidays,
}: ShiftConfirmProps) => {
  const user = useAtomValue(userAtom);

  const saveMutation = useMutation(api.shiftAssignment.mutations.save);
  const closeMutation = useMutation(api.recruitment.mutations.close);
  const confirmMutation = useMutation(api.recruitment.mutations.confirm);

  const shiftsRef = useRef<ShiftData[]>(initialShifts);
  const handleShiftsChange = useCallback((shifts: ShiftData[]) => {
    shiftsRef.current = shifts;
  }, []);

  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const closeDialog = useDialog();
  const confirmDialog = useDialog();

  const saveShifts = async () => {
    const assignments = shiftsRef.current
      .filter((s) => s.positions.length > 0)
      .map((s) => ({
        staffId: s.staffId,
        date: s.date,
        positions: s.positions.map((p) => ({
          positionId: p.positionId,
          positionName: p.positionName,
          color: p.color,
          start: p.start,
          end: p.end,
        })),
      }));
    await saveMutation({
      recruitmentId: recruitmentId as Id<"recruitments">,
      assignments,
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveShifts();
      toaster.create({ description: "シフトを保存しました", type: "success" });
    } catch {
      toaster.create({ description: "シフトの保存に失敗しました", type: "error" });
    } finally {
      setIsSaving(false);
    }
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
    } catch {
      toaster.create({ description: "締め切りに失敗しました", type: "error" });
    } finally {
      setIsClosing(false);
    }
  };

  const handleConfirm = async () => {
    if (!user.authId) return;
    setIsConfirming(true);
    try {
      await saveShifts();
      await confirmMutation({
        recruitmentId: recruitmentId as Id<"recruitments">,
        authId: user.authId,
      });
      confirmDialog.close();
      toaster.create({ description: "シフトを確定しました。スタッフにメールが送信されます。", type: "success" });
    } catch {
      toaster.create({ description: "確定に失敗しました", type: "error" });
    } finally {
      setIsConfirming(false);
    }
  };

  const dateRangeLabel =
    dates.length > 0
      ? `${dayjs(dates[0]).format("M/D(ddd)")} 〜 ${dayjs(dates[dates.length - 1]).format("M/D(ddd)")}`
      : "";
  const badge = STATUS_BADGE[recruitmentStatus];

  return (
    <Container maxW="6xl">
      <Title
        prev={{
          url: `/shops/${shopId}/shifts/recruitments/${recruitmentId}`,
          label: "募集詳細に戻る",
        }}
        action={
          <HStack gap={2} display={{ base: "none", md: "flex" }}>
            <Button variant="outline" size="sm" onClick={handleSave} loading={isSaving}>
              <LuSave />
              保存
            </Button>
            {recruitmentStatus === "open" && (
              <Button colorPalette="orange" size="sm" onClick={closeDialog.open}>
                締め切る
              </Button>
            )}
            {recruitmentStatus === "closed" && (
              <Button colorPalette="teal" size="sm" onClick={confirmDialog.open}>
                <LuCheck />
                確定する
              </Button>
            )}
            {recruitmentStatus === "confirmed" && <Badge colorPalette="blue">確定済み</Badge>}
          </HStack>
        }
      >
        <Flex align="center" gap={3}>
          <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
            <Icon as={LuCalendar} boxSize={6} color="teal.600" />
          </Flex>
          <Box>
            <HStack gap={2}>
              <Heading as="h2" size="xl" color="gray.900">
                シフト編集
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
        {/* モバイル用アクションボタン */}
        <Flex gap={2} mb={4} display={{ base: "flex", md: "none" }}>
          <Button flex={1} variant="outline" onClick={handleSave} loading={isSaving}>
            <LuSave />
            保存
          </Button>
          {recruitmentStatus === "open" && (
            <Button flex={1} colorPalette="orange" onClick={closeDialog.open}>
              締め切る
            </Button>
          )}
          {recruitmentStatus === "closed" && (
            <Button flex={1} colorPalette="teal" onClick={confirmDialog.open}>
              <LuCheck />
              確定する
            </Button>
          )}
        </Flex>

        <ShiftForm
          shopId={shopId}
          staffs={staffs}
          positions={positions}
          initialShifts={initialShifts}
          dates={dates}
          timeRange={timeRange}
          holidays={holidays}
          onShiftsChange={handleShiftsChange}
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

      {/* 確定ダイアログ */}
      <Dialog
        title="シフトを確定しますか？"
        isOpen={confirmDialog.isOpen}
        onOpenChange={confirmDialog.onOpenChange}
        onSubmit={handleConfirm}
        submitLabel="確定する"
        onClose={confirmDialog.close}
        isLoading={isConfirming}
        role="alertdialog"
      >
        <Text>確定すると、全スタッフにメールが送信されます。</Text>
        <Text fontSize="sm" color="gray.500" mt={2}>
          確定後もシフトの編集・保存は可能です（再通知はされません）。
        </Text>
      </Dialog>
    </Container>
  );
};

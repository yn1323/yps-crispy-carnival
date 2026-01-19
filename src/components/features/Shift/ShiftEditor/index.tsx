import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Container,
  Flex,
  Heading,
  Icon,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { LuCalendarCheck, LuCheck, LuUsers } from "react-icons/lu";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { Empty } from "@/src/components/ui/Empty";
import { Select } from "@/src/components/ui/Select";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";

// 希望シフトデータ
type ShiftRequestType = {
  _id: string;
  recruitmentId: string;
  staffId: string;
  staffName: string;
  date: string;
  startTime: string;
  endTime: string;
  note?: string;
};

// 確定シフト編集用の状態型
type ShiftEditStateType = {
  requestId: string;
  staffId: string;
  staffName: string;
  date: string;
  startTime: string;
  endTime: string;
  isConfirmed: boolean;
  position: string;
};

// 募集情報（表示用）
type RecruitmentInfoType = {
  _id: string;
  startDate: string;
  endDate: string;
};

// ポジション選択肢
type PositionOptionType = {
  value: string;
  label: string;
};

// 必要人員データ
type RequiredStaffingType = {
  _id: string;
  shopId: string;
  dayOfWeek: number;
  hour: number;
  position: string;
  requiredCount: number;
};

// 人員充足状況
type StaffingStatusType = {
  hour: number;
  positionCounts: { [position: string]: { assigned: number; required: number } };
};

type ShiftEditorProps = {
  shopId: string;
  recruitmentId: string;
  recruitment: RecruitmentInfoType;
  shiftRequests: ShiftRequestType[];
  positions: PositionOptionType[];
  requiredStaffing: RequiredStaffingType[];
};

export const ShiftEditor = ({
  shopId,
  recruitmentId,
  recruitment,
  shiftRequests,
  positions,
  requiredStaffing,
}: ShiftEditorProps) => {
  // 日付選択（募集期間内の日付を生成）
  const dateOptions = useMemo(() => {
    const dates: { value: string; label: string }[] = [];
    let current = dayjs(recruitment.startDate);
    const end = dayjs(recruitment.endDate);
    while (!current.isAfter(end)) {
      dates.push({
        value: current.format("YYYY-MM-DD"),
        label: current.format("M/D(ddd)"),
      });
      current = current.add(1, "day");
    }
    return dates;
  }, [recruitment.startDate, recruitment.endDate]);

  const [selectedDate, setSelectedDate] = useState(dateOptions[0]?.value ?? "");

  // 確定状態の管理
  const [editStates, setEditStates] = useState<ShiftEditStateType[]>(() =>
    shiftRequests.map((req) => ({
      requestId: req._id,
      staffId: req.staffId,
      staffName: req.staffName,
      date: req.date,
      startTime: req.startTime,
      endTime: req.endTime,
      isConfirmed: false,
      position: positions[0]?.value ?? "",
    })),
  );

  // 選択日のシフト一覧
  const filteredShifts = editStates.filter((s) => s.date === selectedDate);

  // 確定チェック切り替え
  const handleToggleConfirm = (requestId: string, checked: boolean) => {
    setEditStates((prev) => prev.map((s) => (s.requestId === requestId ? { ...s, isConfirmed: checked } : s)));
  };

  // ポジション変更
  const handlePositionChange = (requestId: string, position: string) => {
    setEditStates((prev) => prev.map((s) => (s.requestId === requestId ? { ...s, position } : s)));
  };

  // 人員充足ダイアログ
  const staffingDialog = useDialog();

  // 人員充足状況の計算
  const staffingStatus = useMemo(() => {
    const confirmed = editStates.filter((s) => s.isConfirmed && s.date === selectedDate);
    const selectedDayOfWeek = dayjs(selectedDate).day();
    const relevantStaffing = requiredStaffing.filter((r) => r.dayOfWeek === selectedDayOfWeek);

    // 時間帯ごとの集計
    const hourlyMap: { [hour: number]: StaffingStatusType } = {};

    // 必要人員を初期化
    for (const req of relevantStaffing) {
      if (!hourlyMap[req.hour]) {
        hourlyMap[req.hour] = { hour: req.hour, positionCounts: {} };
      }
      hourlyMap[req.hour].positionCounts[req.position] = {
        assigned: 0,
        required: req.requiredCount,
      };
    }

    // 確定シフトをカウント
    for (const shift of confirmed) {
      const startHour = Number.parseInt(shift.startTime.split(":")[0], 10);
      const endHour = Number.parseInt(shift.endTime.split(":")[0], 10);
      for (let h = startHour; h < endHour; h++) {
        if (hourlyMap[h]?.positionCounts[shift.position]) {
          hourlyMap[h].positionCounts[shift.position].assigned += 1;
        }
      }
    }

    return Object.values(hourlyMap).sort((a, b) => a.hour - b.hour);
  }, [editStates, selectedDate, requiredStaffing]);

  // シフト確定処理
  const handleConfirmShifts = () => {
    const confirmedShifts = editStates.filter((s) => s.isConfirmed);
    if (confirmedShifts.length === 0) {
      toaster.create({
        description: "確定するシフトを選択してください",
        type: "warning",
      });
      return;
    }
    // TODO: useMutation呼び出し
    console.log("確定シフト:", confirmedShifts);
    toaster.create({
      description: `${confirmedShifts.length}件のシフトを確定しました`,
      type: "success",
    });
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    return `${dayjs(startDate).format("M/D(ddd)")}〜${dayjs(endDate).format("M/D(ddd)")}`;
  };

  const confirmedCount = editStates.filter((s) => s.isConfirmed).length;

  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title prev={{ url: `/shops/${shopId}/shifts/recruitments/${recruitmentId}`, label: "申請状況に戻る" }}>
        <Flex align="center" gap={3}>
          <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
            <Icon as={LuCalendarCheck} boxSize={6} color="teal.600" />
          </Flex>
          <Box>
            <Heading as="h2" size="xl" color="gray.900">
              シフト確定
            </Heading>
            <Text color="gray.500" fontSize="sm">
              {formatDateRange(recruitment.startDate, recruitment.endDate)}
            </Text>
          </Box>
        </Flex>
      </Title>

      {/* 日付選択 & サマリー */}
      <Flex
        mb={4}
        gap={4}
        direction={{ base: "column", sm: "row" }}
        justify="space-between"
        align={{ base: "stretch", sm: "center" }}
      >
        <Select items={dateOptions} value={selectedDate} onChange={setSelectedDate} w={{ base: "full", md: "200px" }} />
        <Text color="gray.600" fontSize="sm" fontWeight="medium">
          確定済み: {confirmedCount}/{editStates.length}件
        </Text>
      </Flex>

      {/* PC表示: Table形式 */}
      <Box display={{ base: "none", md: "block" }}>
        <ShiftTable
          shifts={filteredShifts}
          positions={positions}
          onToggleConfirm={handleToggleConfirm}
          onPositionChange={handlePositionChange}
        />
      </Box>

      {/* SP表示: Card形式 */}
      <Box display={{ base: "block", md: "none" }}>
        <ShiftCardList
          shifts={filteredShifts}
          positions={positions}
          onToggleConfirm={handleToggleConfirm}
          onPositionChange={handlePositionChange}
        />
      </Box>

      {/* アクションボタン */}
      <Flex
        mt={6}
        gap={3}
        direction={{ base: "column", sm: "row" }}
        justify="flex-end"
        borderTop="1px solid"
        borderColor="gray.200"
        pt={6}
      >
        <Button variant="outline" onClick={staffingDialog.open} w={{ base: "full", sm: "auto" }}>
          <Icon as={LuUsers} />
          人員充足を確認
        </Button>
        <Button colorPalette="teal" onClick={handleConfirmShifts} w={{ base: "full", sm: "auto" }}>
          <Icon as={LuCheck} />
          シフトを確定する
        </Button>
      </Flex>

      {/* 人員充足確認ダイアログ */}
      <Dialog
        title="人員充足状況"
        isOpen={staffingDialog.isOpen}
        onOpenChange={staffingDialog.onOpenChange}
        onClose={staffingDialog.close}
        closeLabel="閉じる"
      >
        <StaffingComparisonTable staffingStatus={staffingStatus} selectedDate={selectedDate} positions={positions} />
      </Dialog>
    </Container>
  );
};

// PC用テーブル
const ShiftTable = ({
  shifts,
  positions,
  onToggleConfirm,
  onPositionChange,
}: {
  shifts: ShiftEditStateType[];
  positions: PositionOptionType[];
  onToggleConfirm: (requestId: string, checked: boolean) => void;
  onPositionChange: (requestId: string, position: string) => void;
}) => {
  if (shifts.length === 0) {
    return (
      <Empty icon={LuCalendarCheck} title="この日の希望シフトはありません" description="他の日付を選択してください" />
    );
  }

  return (
    <Table.Root size="sm" variant="line">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>スタッフ</Table.ColumnHeader>
          <Table.ColumnHeader>希望時間</Table.ColumnHeader>
          <Table.ColumnHeader textAlign="center">確定</Table.ColumnHeader>
          <Table.ColumnHeader>ポジション</Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {shifts.map((shift) => (
          <Table.Row key={shift.requestId}>
            <Table.Cell fontWeight="medium">{shift.staffName}</Table.Cell>
            <Table.Cell>
              {shift.startTime}-{shift.endTime}
            </Table.Cell>
            <Table.Cell textAlign="center">
              <Checkbox.Root
                checked={shift.isConfirmed}
                onCheckedChange={(e) => onToggleConfirm(shift.requestId, !!e.checked)}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
              </Checkbox.Root>
            </Table.Cell>
            <Table.Cell>
              <Select
                items={positions}
                value={shift.position}
                onChange={(value) => onPositionChange(shift.requestId, value)}
                w="120px"
                usePortal={false}
              />
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
};

// SP用カードリスト
const ShiftCardList = ({
  shifts,
  positions,
  onToggleConfirm,
  onPositionChange,
}: {
  shifts: ShiftEditStateType[];
  positions: PositionOptionType[];
  onToggleConfirm: (requestId: string, checked: boolean) => void;
  onPositionChange: (requestId: string, position: string) => void;
}) => {
  if (shifts.length === 0) {
    return (
      <Empty icon={LuCalendarCheck} title="この日の希望シフトはありません" description="他の日付を選択してください" />
    );
  }

  return (
    <VStack gap={3} align="stretch">
      {shifts.map((shift) => (
        <Card.Root key={shift.requestId} borderWidth={0} shadow="sm">
          <Card.Body p={3}>
            <Text fontWeight="bold" mb={2}>
              {shift.staffName}
            </Text>
            <Text fontSize="sm" color="gray.600" mb={3}>
              希望: {shift.startTime}-{shift.endTime}
            </Text>
            <Flex gap={3} align="center">
              <Checkbox.Root
                checked={shift.isConfirmed}
                onCheckedChange={(e) => onToggleConfirm(shift.requestId, !!e.checked)}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
                <Checkbox.Label>確定</Checkbox.Label>
              </Checkbox.Root>
              <Select
                items={positions}
                value={shift.position}
                onChange={(value) => onPositionChange(shift.requestId, value)}
                w="120px"
                usePortal={false}
              />
            </Flex>
          </Card.Body>
        </Card.Root>
      ))}
    </VStack>
  );
};

// 人員充足比較テーブル
const StaffingComparisonTable = ({
  staffingStatus,
  selectedDate,
  positions,
}: {
  staffingStatus: StaffingStatusType[];
  selectedDate: string;
  positions: PositionOptionType[];
}) => {
  if (staffingStatus.length === 0) {
    return (
      <Text color="gray.500" textAlign="center" py={4}>
        この日の必要人員設定がありません
      </Text>
    );
  }

  return (
    <Box>
      <Text mb={3} fontWeight="medium">
        {dayjs(selectedDate).format("M/D(ddd)")} の人員状況
      </Text>
      <Table.Root size="sm" variant="outline">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>時間帯</Table.ColumnHeader>
            {positions.map((pos) => (
              <Table.ColumnHeader key={pos.value} textAlign="center">
                {pos.label}
              </Table.ColumnHeader>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {staffingStatus.map((status) => (
            <Table.Row key={status.hour}>
              <Table.Cell>
                {status.hour}:00-{status.hour + 1}:00
              </Table.Cell>
              {positions.map((pos) => {
                const count = status.positionCounts[pos.label];
                if (!count) {
                  return (
                    <Table.Cell key={pos.value} textAlign="center">
                      <Text color="gray.400">-</Text>
                    </Table.Cell>
                  );
                }
                const isSufficient = count.assigned >= count.required;
                return (
                  <Table.Cell key={pos.value} textAlign="center">
                    <Badge colorPalette={isSufficient ? "green" : "orange"}>
                      {count.assigned}/{count.required}
                    </Badge>
                  </Table.Cell>
                );
              })}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
};

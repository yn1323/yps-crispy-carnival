import { Box, Button, Card, Container, Flex, Heading, Icon, Input, Table, Text, VStack } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuCopy, LuRefreshCw, LuSave, LuSettings } from "react-icons/lu";
import { useDialog } from "@/src/components/ui/Dialog";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import { CopyModal } from "./CopyModal";
import { DayTabs } from "./DayTabs";
import { RegenerateModal } from "./RegenerateModal";

// 必要人員データ型
type RequiredStaffingType = {
  _id: string;
  shopId: string;
  dayOfWeek: number;
  hour: number;
  position: string;
  requiredCount: number;
};

type PositionType = {
  _id: string;
  name: string;
};

type ShopType = {
  _id: string;
  shopName: string;
  openTime: string;
  closeTime: string;
};

type StaffingItem = {
  hour: number;
  position: string;
  requiredCount: number;
};

type AIInput = {
  shopType: string;
  customerCount: string;
};

type StaffingMatrixProps = {
  shopId: string;
  shop: ShopType;
  positions: PositionType[];
  initialStaffing: RequiredStaffingType[];
  onSave: (params: { dayOfWeek: number; staffing: StaffingItem[]; aiInput?: AIInput }) => Promise<void>;
  onCopy: (params: { sourceDayOfWeek: number; targetDaysOfWeek: number[] }) => Promise<void>;
  isSaving?: boolean;
  isCopying?: boolean;
};

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export const StaffingMatrix = ({
  shopId,
  shop,
  positions,
  initialStaffing,
  onSave,
  onCopy,
  isSaving = false,
  isCopying = false,
}: StaffingMatrixProps) => {
  // 曜日タブ選択（月曜=1をデフォルト）
  const [selectedDay, setSelectedDay] = useState(1);

  // モーダル管理
  const copyModal = useDialog();
  const regenerateModal = useDialog();

  // AI入力の保存（作り直す時に前回値を使用）
  const [aiInput, setAiInput] = useState({ shopType: "", customerCount: "" });

  // 営業時間から時間帯リストを生成
  const hours = useMemo(() => {
    const openHour = Number.parseInt(shop.openTime.split(":")[0], 10);
    const closeHour = Number.parseInt(shop.closeTime.split(":")[0], 10);
    const result: number[] = [];
    for (let h = openHour; h < closeHour; h++) {
      result.push(h);
    }
    return result;
  }, [shop.openTime, shop.closeTime]);

  // 人員数マトリックス: { `${dayOfWeek}-${hour}-${position}`: count }
  const [staffingMap, setStaffingMap] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const item of initialStaffing) {
      const key = `${item.dayOfWeek}-${item.hour}-${item.position}`;
      map[key] = item.requiredCount;
    }
    return map;
  });

  // 変更フラグ
  const [hasChanges, setHasChanges] = useState(false);

  // 人員数取得
  const getCount = (dayOfWeek: number, hour: number, position: string) => {
    const key = `${dayOfWeek}-${hour}-${position}`;
    return staffingMap[key] ?? 0;
  };

  // 人員数更新
  const handleCountChange = (dayOfWeek: number, hour: number, position: string, value: number) => {
    const key = `${dayOfWeek}-${hour}-${position}`;
    setStaffingMap((prev) => ({ ...prev, [key]: Math.max(0, Math.min(10, value)) }));
    setHasChanges(true);
  };

  // 現在の曜日のstaffing配列を生成
  const buildStaffingArray = (dayOfWeek: number) => {
    const result: { hour: number; position: string; requiredCount: number }[] = [];
    for (const hour of hours) {
      for (const pos of positions) {
        const key = `${dayOfWeek}-${hour}-${pos.name}`;
        result.push({
          hour,
          position: pos.name,
          requiredCount: staffingMap[key] ?? 0,
        });
      }
    }
    return result;
  };

  // 保存処理
  const handleSave = async () => {
    try {
      await onSave({
        dayOfWeek: selectedDay,
        staffing: buildStaffingArray(selectedDay),
        aiInput: aiInput.shopType ? aiInput : undefined,
      });
      setHasChanges(false);
    } catch {
      // エラーはpages側でハンドリング済み
    }
  };

  // コピー処理
  const handleCopy = async (targetDays: number[]) => {
    try {
      // まず現在の曜日を保存
      await onSave({
        dayOfWeek: selectedDay,
        staffing: buildStaffingArray(selectedDay),
      });

      // 他の曜日にコピー
      await onCopy({
        sourceDayOfWeek: selectedDay,
        targetDaysOfWeek: targetDays,
      });

      // ローカルstateも更新
      setStaffingMap((prev) => {
        const newMap = { ...prev };
        for (const hour of hours) {
          for (const pos of positions) {
            const sourceKey = `${selectedDay}-${hour}-${pos.name}`;
            const sourceValue = prev[sourceKey] ?? 0;
            for (const targetDay of targetDays) {
              const targetKey = `${targetDay}-${hour}-${pos.name}`;
              newMap[targetKey] = sourceValue;
            }
          }
        }
        return newMap;
      });

      copyModal.close();
    } catch {
      // エラーはpages側でハンドリング済み
    }
  };

  // AI再生成処理
  const handleRegenerate = (
    result: { hour: number; position: string; requiredCount: number }[],
    newAiInput: { shopType: string; customerCount: string },
  ) => {
    setStaffingMap((prev) => {
      const newMap = { ...prev };
      for (const item of result) {
        const key = `${selectedDay}-${item.hour}-${item.position}`;
        newMap[key] = item.requiredCount;
      }
      return newMap;
    });
    setAiInput(newAiInput);
    setHasChanges(true);
    regenerateModal.close();
    toaster.create({
      description: "AIで再生成しました",
      type: "success",
    });
  };

  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title prev={{ url: `/shops/${shopId}/shifts`, label: "シフト管理に戻る" }}>
        <Flex align="center" gap={3}>
          <Flex p={{ base: 2, md: 3 }} bg="purple.50" borderRadius="lg">
            <Icon as={LuSettings} boxSize={6} color="purple.600" />
          </Flex>
          <Box>
            <Heading as="h2" size="xl" color="gray.900">
              必要人員設定
            </Heading>
            <Text color="gray.500" fontSize="sm">
              {shop.shopName}
            </Text>
          </Box>
        </Flex>
      </Title>

      {/* 曜日タブ + アクションボタン */}
      <Flex mb={4} justify="space-between" align="center" wrap="wrap" gap={3}>
        <DayTabs selectedDay={selectedDay} onChange={setSelectedDay} />

        <Flex gap={2}>
          <Button variant="outline" size="sm" onClick={copyModal.open}>
            <Icon as={LuCopy} />
            コピー
          </Button>
          <Button variant="outline" size="sm" onClick={regenerateModal.open}>
            <Icon as={LuRefreshCw} />
            作り直す
          </Button>
        </Flex>
      </Flex>

      {/* 曜日見出し */}
      <Text fontWeight="bold" mb={3} color="gray.700">
        {DAY_LABELS[selectedDay]}曜日の必要人員
      </Text>

      {/* PC表示: Table形式 */}
      <Box display={{ base: "none", md: "block" }}>
        <StaffingTable
          hours={hours}
          positions={positions}
          dayOfWeek={selectedDay}
          getCount={getCount}
          onCountChange={handleCountChange}
        />
      </Box>

      {/* SP表示: Card形式 */}
      <Box display={{ base: "block", md: "none" }}>
        <StaffingCardList
          hours={hours}
          positions={positions}
          dayOfWeek={selectedDay}
          getCount={getCount}
          onCountChange={handleCountChange}
        />
      </Box>

      {/* コピーモーダル */}
      <CopyModal
        isOpen={copyModal.isOpen}
        onOpenChange={copyModal.onOpenChange}
        onClose={copyModal.close}
        sourceDayOfWeek={selectedDay}
        onCopy={handleCopy}
        isLoading={isCopying}
      />

      {/* AI再生成モーダル */}
      <RegenerateModal
        isOpen={regenerateModal.isOpen}
        onOpenChange={regenerateModal.onOpenChange}
        onClose={regenerateModal.close}
        initialAIInput={aiInput}
        onRegenerate={handleRegenerate}
        openTime={shop.openTime}
        closeTime={shop.closeTime}
        positions={positions}
      />

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
        <Button
          colorPalette="teal"
          onClick={handleSave}
          disabled={!hasChanges}
          loading={isSaving}
          w={{ base: "full", sm: "auto" }}
        >
          <Icon as={LuSave} />
          保存する
        </Button>
      </Flex>
    </Container>
  );
};

// PC用テーブル
const StaffingTable = ({
  hours,
  positions,
  dayOfWeek,
  getCount,
  onCountChange,
}: {
  hours: number[];
  positions: PositionType[];
  dayOfWeek: number;
  getCount: (dayOfWeek: number, hour: number, position: string) => number;
  onCountChange: (dayOfWeek: number, hour: number, position: string, value: number) => void;
}) => {
  return (
    <Table.Root size="sm" variant="outline">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>時間帯</Table.ColumnHeader>
          {positions.map((pos) => (
            <Table.ColumnHeader key={pos._id} textAlign="center">
              {pos.name}
            </Table.ColumnHeader>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {hours.map((hour) => (
          <Table.Row key={hour}>
            <Table.Cell fontWeight="medium">
              {hour}:00-{hour + 1}:00
            </Table.Cell>
            {positions.map((pos) => (
              <Table.Cell key={pos._id} textAlign="center">
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={getCount(dayOfWeek, hour, pos.name)}
                  onChange={(e) => onCountChange(dayOfWeek, hour, pos.name, Number.parseInt(e.target.value, 10) || 0)}
                  w="60px"
                  textAlign="center"
                  size="sm"
                />
              </Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
};

// SP用カードリスト
const StaffingCardList = ({
  hours,
  positions,
  dayOfWeek,
  getCount,
  onCountChange,
}: {
  hours: number[];
  positions: PositionType[];
  dayOfWeek: number;
  getCount: (dayOfWeek: number, hour: number, position: string) => number;
  onCountChange: (dayOfWeek: number, hour: number, position: string, value: number) => void;
}) => {
  return (
    <VStack gap={3} align="stretch">
      {hours.map((hour) => (
        <Card.Root key={hour} borderWidth={0} shadow="sm">
          <Card.Body p={3}>
            <Text fontWeight="bold" mb={3}>
              {hour}:00-{hour + 1}:00
            </Text>
            <Flex gap={3} wrap="wrap">
              {positions.map((pos) => (
                <Flex key={pos._id} align="center" gap={2}>
                  <Text fontSize="sm" color="gray.600" minW="60px">
                    {pos.name}
                  </Text>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={getCount(dayOfWeek, hour, pos.name)}
                    onChange={(e) => onCountChange(dayOfWeek, hour, pos.name, Number.parseInt(e.target.value, 10) || 0)}
                    w="60px"
                    textAlign="center"
                    size="sm"
                  />
                </Flex>
              ))}
            </Flex>
          </Card.Body>
        </Card.Root>
      ))}
    </VStack>
  );
};

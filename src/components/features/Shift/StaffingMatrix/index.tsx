import { Box, Button, Card, Container, Flex, Heading, Icon, Input, Table, Tabs, Text, VStack } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuSave, LuSettings } from "react-icons/lu";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";

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

type StaffingMatrixProps = {
  shopId: string;
  shop: ShopType;
  positions: PositionType[];
  initialStaffing: RequiredStaffingType[];
};

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export const StaffingMatrix = ({ shopId, shop, positions, initialStaffing }: StaffingMatrixProps) => {
  // 曜日タブ選択（月曜=1をデフォルト）
  const [selectedDay, setSelectedDay] = useState("1");

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

  // 保存処理
  const handleSave = () => {
    // TODO: useMutation呼び出し
    console.log("保存データ:", staffingMap);
    toaster.create({
      description: "必要人員設定を保存しました",
      type: "success",
    });
    setHasChanges(false);
  };

  const currentDayOfWeek = Number.parseInt(selectedDay, 10);

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

      {/* 曜日タブ */}
      <Box mb={4}>
        <Tabs.Root value={selectedDay} onValueChange={(e) => setSelectedDay(e.value)} variant="outline">
          <Tabs.List>
            {DAY_LABELS.map((day, idx) => (
              <Tabs.Trigger key={idx} value={String(idx)} px={{ base: 3, md: 4 }}>
                {day}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.Root>
      </Box>

      {/* 曜日見出し */}
      <Text fontWeight="bold" mb={3} color="gray.700">
        {DAY_LABELS[currentDayOfWeek]}曜日の必要人員
      </Text>

      {/* PC表示: Table形式 */}
      <Box display={{ base: "none", md: "block" }}>
        <StaffingTable
          hours={hours}
          positions={positions}
          dayOfWeek={currentDayOfWeek}
          getCount={getCount}
          onCountChange={handleCountChange}
        />
      </Box>

      {/* SP表示: Card形式 */}
      <Box display={{ base: "block", md: "none" }}>
        <StaffingCardList
          hours={hours}
          positions={positions}
          dayOfWeek={currentDayOfWeek}
          getCount={getCount}
          onCountChange={handleCountChange}
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
        <Button colorPalette="purple" onClick={handleSave} disabled={!hasChanges} w={{ base: "full", sm: "auto" }}>
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

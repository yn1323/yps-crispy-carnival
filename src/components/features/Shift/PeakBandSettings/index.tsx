import { Box, Button, Container, Flex, Heading, Icon, IconButton, Input, Tabs, Text, VStack } from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LuCircle, LuMinus, LuPlus, LuSettings, LuTrash2 } from "react-icons/lu";
import { useDialog } from "@/src/components/ui/Dialog";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import type { PeakBand } from "../ShiftForm/types";
import { HOLIDAY_DAYS, WEEKDAY_DAYS } from "./constants";
import { DayTabs } from "./DayTabs";
import { ModeConfirmDialog } from "./ModeConfirmDialog";

type DaySettings = {
  peakBands: PeakBand[];
  minimumStaff: number;
};

export type InitialDayData = {
  dayOfWeek: number;
  peakBands?: PeakBand[];
  minimumStaff?: number;
};

type Mode = "simple" | "detailed";
type SimpleGroup = "weekday" | "holiday";

type PeakBandSettingsProps = {
  shopId: string;
  shopName: string;
  initialData?: InitialDayData[];
  onSave: (params: { dayOfWeeks: readonly number[]; peakBands: PeakBand[]; minimumStaff: number }) => Promise<void>;
  isSaving?: boolean;
};

// ============================================================
// 定数
// ============================================================

const DEFAULT_PEAK_BAND: PeakBand = { startTime: "11:00", endTime: "14:00", requiredCount: 3 };
const DEFAULT_DAY_SETTINGS: DaySettings = { peakBands: [], minimumStaff: 1 };

// ============================================================
// ユーティリティ
// ============================================================

/** 初期データからdaySettingsMapを構築 */
const buildDaySettingsMap = (data: InitialDayData[]): Record<number, DaySettings> => {
  const map: Record<number, DaySettings> = {};
  for (const d of data) {
    if (d.peakBands && d.peakBands.length > 0) {
      map[d.dayOfWeek] = {
        peakBands: d.peakBands,
        minimumStaff: d.minimumStaff ?? 1,
      };
    }
  }
  return map;
};

/** 初期データからモードを推定 */
const inferMode = (data: InitialDayData[]): Mode => {
  if (data.length === 0) return "simple";

  const hasPeakBands = data.filter((d) => d.peakBands && d.peakBands.length > 0);
  if (hasPeakBands.length === 0) return "simple";

  // 平日が全て同じ設定で、休日も全て同じ設定ならsimple
  const weekdays = hasPeakBands.filter((d) => (WEEKDAY_DAYS as readonly number[]).includes(d.dayOfWeek));
  const holidays = hasPeakBands.filter((d) => (HOLIDAY_DAYS as readonly number[]).includes(d.dayOfWeek));

  const allSame = (items: InitialDayData[]) => {
    if (items.length <= 1) return true;
    const first = JSON.stringify({ peakBands: items[0].peakBands, minimumStaff: items[0].minimumStaff });
    return items.every(
      (item) => JSON.stringify({ peakBands: item.peakBands, minimumStaff: item.minimumStaff }) === first,
    );
  };

  return allSame(weekdays) && allSame(holidays) ? "simple" : "detailed";
};

/** simpleグループの代表dayOfWeekを取得 */
const getRepresentativeDay = (group: SimpleGroup): number => (group === "weekday" ? 1 : 0);

/** simpleグループのdayOfWeek配列を取得 */
const getGroupDays = (group: SimpleGroup): readonly number[] => (group === "weekday" ? WEEKDAY_DAYS : HOLIDAY_DAYS);

// ============================================================
// メインコンポーネント
// ============================================================

export const PeakBandSettings = ({
  shopId,
  shopName,
  initialData = [],
  onSave,
  isSaving = false,
}: PeakBandSettingsProps) => {
  const [mode, setMode] = useState<Mode>(() => inferMode(initialData));
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState<SimpleGroup>("weekday");
  const [daySettingsMap, setDaySettingsMap] = useState<Record<number, DaySettings>>(() =>
    buildDaySettingsMap(initialData),
  );
  const [hasChanges, setHasChanges] = useState(false);
  const confirmDialog = useDialog();

  // initialData変更時にdaySettingsMapを同期（selectedDayは維持）
  useEffect(() => {
    setDaySettingsMap(buildDaySettingsMap(initialData));
    setHasChanges(false);
  }, [initialData]);

  // 現在の編集対象dayOfWeek
  const activeDayOfWeek = mode === "simple" ? getRepresentativeDay(selectedGroup) : selectedDay;
  const currentSettings = daySettingsMap[activeDayOfWeek] ?? DEFAULT_DAY_SETTINGS;

  // 設定済み曜日の一覧
  const configuredDays = useMemo(
    () =>
      Object.keys(daySettingsMap)
        .map(Number)
        .filter((day) => {
          const s = daySettingsMap[day];
          return s && s.peakBands.length > 0;
        }),
    [daySettingsMap],
  );

  // ============================================================
  // ハンドラ
  // ============================================================

  const updateCurrentDay = useCallback(
    (updater: (prev: DaySettings) => DaySettings) => {
      setDaySettingsMap((prev) => ({
        ...prev,
        [activeDayOfWeek]: updater(prev[activeDayOfWeek] ?? DEFAULT_DAY_SETTINGS),
      }));
      setHasChanges(true);
    },
    [activeDayOfWeek],
  );

  const handleAddBand = useCallback(() => {
    updateCurrentDay((prev) => ({
      ...prev,
      peakBands: [...prev.peakBands, { ...DEFAULT_PEAK_BAND }],
    }));
  }, [updateCurrentDay]);

  const handleRemoveBand = useCallback(
    (index: number) => {
      updateCurrentDay((prev) => ({
        ...prev,
        peakBands: prev.peakBands.filter((_, i) => i !== index),
      }));
    },
    [updateCurrentDay],
  );

  const handleBandChange = useCallback(
    (index: number, field: keyof PeakBand, value: string | number) => {
      const clampedValue = field === "requiredCount" ? Math.max(1, Number(value)) : value;
      updateCurrentDay((prev) => ({
        ...prev,
        peakBands: prev.peakBands.map((band, i) => (i === index ? { ...band, [field]: clampedValue } : band)),
      }));
    },
    [updateCurrentDay],
  );

  const handleMinimumStaffChange = useCallback(
    (value: number) => {
      updateCurrentDay((prev) => ({ ...prev, minimumStaff: Math.max(0, value) }));
    },
    [updateCurrentDay],
  );

  const handleSave = useCallback(async () => {
    for (const band of currentSettings.peakBands) {
      if (band.startTime >= band.endTime) {
        toaster.create({ description: "終了時刻は開始時刻より後にしてください", type: "error" });
        return;
      }
    }
    try {
      const dayOfWeeks = mode === "simple" ? getGroupDays(selectedGroup) : [selectedDay];
      await onSave({
        dayOfWeeks,
        peakBands: currentSettings.peakBands,
        minimumStaff: currentSettings.minimumStaff,
      });
      setHasChanges(false);
    } catch {
      // エラーは親でハンドリング
    }
  }, [mode, selectedGroup, selectedDay, currentSettings, onSave]);

  // モード切替
  const handleModeChange = useCallback(
    (newMode: Mode) => {
      if (newMode === mode) return;
      if (newMode === "simple") {
        // 詳細→かんたん: 確認ダイアログ表示
        confirmDialog.open();
      } else {
        // かんたん→詳細: そのまま切替
        setMode("detailed");
        setSelectedDay(1);
      }
    },
    [mode, confirmDialog],
  );

  const handleConfirmModeSwitch = useCallback(() => {
    setMode("simple");
    setSelectedGroup("weekday");
    confirmDialog.close();
  }, [confirmDialog]);

  // ============================================================
  // レンダリング
  // ============================================================

  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title prev={{ url: `/shops/${shopId}/shifts`, label: "シフト管理" }}>
        <Flex align="center" gap={3}>
          <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
            <Icon as={LuSettings} boxSize={6} color="teal.600" />
          </Flex>
          <Box>
            <Heading as="h2" size={{ base: "lg", md: "xl" }} color="gray.900">
              必要人員設定
            </Heading>
            <Text color="gray.500" fontSize="sm" display={{ base: "none", md: "block" }}>
              {shopName}
            </Text>
          </Box>
        </Flex>
      </Title>

      {/* モード切替タブ */}
      <Tabs.Root
        value={mode}
        onValueChange={(e) => handleModeChange(e.value as Mode)}
        variant="enclosed"
        size="sm"
        mb={2}
      >
        <Tabs.List>
          <Tabs.Trigger value="simple" px={4}>
            かんたんモード
          </Tabs.Trigger>
          <Tabs.Trigger value="detailed" px={4}>
            詳細モード
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>

      {/* モード説明 */}
      <Text fontSize="xs" color="gray.500" mb={4}>
        {mode === "simple"
          ? "平日・休日の2パターンでかんたんに設定できます"
          : "曜日ごとに細かくピーク帯と人数を設定できます"}
      </Text>

      {/* 曜日セレクタ */}
      <Box mb={6}>
        {mode === "simple" ? (
          <SimpleDayTabs selectedGroup={selectedGroup} onChange={setSelectedGroup} />
        ) : (
          <DayTabs selectedDay={selectedDay} onChange={setSelectedDay} configuredDays={configuredDays} />
        )}
      </Box>

      {/* ピーク帯設定 */}
      <VStack align="stretch" gap={6}>
        {/* SP版: セクションヘッダー */}
        <Text fontWeight="bold" fontSize="md" display={{ base: "block", md: "none" }}>
          ピーク帯設定
        </Text>

        {/* ピーク帯リスト */}
        <VStack gap={3} align="stretch">
          {currentSettings.peakBands.map((band, index) => (
            <PeakBandRow
              key={`band-${index}`}
              band={band}
              index={index}
              onBandChange={handleBandChange}
              onRemove={handleRemoveBand}
            />
          ))}
        </VStack>

        {/* ピーク帯追加ボタン */}
        <Flex justify="center">
          <Button
            size="sm"
            variant="outline"
            colorPalette="teal"
            onClick={handleAddBand}
            w={{ base: "100%", md: "auto" }}
          >
            <Icon as={LuPlus} />
            ピーク帯を追加
          </Button>
        </Flex>

        {/* 最低人員 */}
        <MinimumStaffSection value={currentSettings.minimumStaff} onChange={handleMinimumStaffChange} />
      </VStack>

      {/* 保存バー */}
      <Flex py={3} mt={6} justify="flex-end">
        <Button colorPalette="teal" onClick={handleSave} disabled={!hasChanges} loading={isSaving}>
          保存
        </Button>
      </Flex>

      {/* モード切替確認ダイアログ */}
      <ModeConfirmDialog
        isOpen={confirmDialog.isOpen}
        onOpenChange={confirmDialog.onOpenChange}
        onConfirm={handleConfirmModeSwitch}
        onCancel={confirmDialog.close}
      />
    </Container>
  );
};

// ============================================================
// サブコンポーネント: かんたんモードのタブ（平日/休日）
// ============================================================

const SimpleDayTabs = ({
  selectedGroup,
  onChange,
}: {
  selectedGroup: SimpleGroup;
  onChange: (group: SimpleGroup) => void;
}) => (
  <Tabs.Root
    value={selectedGroup}
    onValueChange={(e) => onChange(e.value as SimpleGroup)}
    variant="line"
    colorPalette="teal"
    size="sm"
  >
    <Tabs.List>
      <Tabs.Trigger value="weekday" px={{ base: 6, md: 4 }} flex={{ base: 1, md: "initial" }}>
        平日
      </Tabs.Trigger>
      <Tabs.Trigger value="holiday" px={{ base: 6, md: 4 }} flex={{ base: 1, md: "initial" }} color="red.500">
        休日
      </Tabs.Trigger>
    </Tabs.List>
  </Tabs.Root>
);

// ============================================================
// サブコンポーネント: ピーク帯行
// ============================================================

const PeakBandRow = ({
  band,
  index,
  onBandChange,
  onRemove,
}: {
  band: PeakBand;
  index: number;
  onBandChange: (index: number, field: keyof PeakBand, value: string | number) => void;
  onRemove: (index: number) => void;
}) => (
  <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" p={3} position="relative">
    {/* PC版レイアウト */}
    <Flex display={{ base: "none", md: "flex" }} gap={3} align="center">
      <Text color="gray.500" fontSize="sm" flexShrink={0}>
        時間帯
      </Text>
      <Input
        size="sm"
        type="time"
        value={band.startTime}
        onChange={(e) => onBandChange(index, "startTime", e.target.value)}
        w="130px"
      />
      <Text color="gray.400" fontSize="sm">
        〜
      </Text>
      <Input
        size="sm"
        type="time"
        value={band.endTime}
        onChange={(e) => onBandChange(index, "endTime", e.target.value)}
        w="130px"
      />
      <Text color="gray.500" fontSize="sm" flexShrink={0}>
        必要人数
      </Text>
      <Input
        size="sm"
        type="number"
        min={1}
        value={band.requiredCount}
        onChange={(e) => onBandChange(index, "requiredCount", Number(e.target.value))}
        w="70px"
        textAlign="center"
      />
      <Text color="gray.500" fontSize="sm">
        人
      </Text>
      <Box flex={1} />
      <IconButton size="sm" variant="ghost" colorPalette="red" aria-label="削除" onClick={() => onRemove(index)}>
        <Icon as={LuTrash2} />
      </IconButton>
    </Flex>

    {/* SP版レイアウト */}
    <Flex display={{ base: "flex", md: "none" }} direction="column" gap={2}>
      {/* 時間帯 + 削除ボタン */}
      <Flex align="center" gap={2}>
        <Input
          size="sm"
          type="time"
          value={band.startTime}
          onChange={(e) => onBandChange(index, "startTime", e.target.value)}
          flex={1}
        />
        <Text color="gray.400" fontSize="sm">
          〜
        </Text>
        <Input
          size="sm"
          type="time"
          value={band.endTime}
          onChange={(e) => onBandChange(index, "endTime", e.target.value)}
          flex={1}
        />
        <IconButton size="sm" variant="ghost" colorPalette="red" aria-label="削除" onClick={() => onRemove(index)}>
          <Icon as={LuTrash2} />
        </IconButton>
      </Flex>

      {/* 人数ステッパー */}
      <Flex align="center" gap={2}>
        <IconButton
          variant="outline"
          size="xs"
          aria-label="減らす"
          onClick={() => onBandChange(index, "requiredCount", Math.max(1, band.requiredCount - 1))}
          disabled={band.requiredCount <= 1}
        >
          <LuMinus />
        </IconButton>
        <Text fontWeight="medium" fontSize="sm" minW="2ch" textAlign="center">
          {band.requiredCount}
        </Text>
        <IconButton
          variant="outline"
          size="xs"
          aria-label="増やす"
          colorPalette="teal"
          onClick={() => onBandChange(index, "requiredCount", band.requiredCount + 1)}
        >
          <LuPlus />
        </IconButton>
        <Text color="gray.500" fontSize="sm">
          人
        </Text>
      </Flex>
    </Flex>
  </Box>
);

// ============================================================
// サブコンポーネント: 最低人員セクション
// ============================================================

const MinimumStaffSection = ({ value, onChange }: { value: number; onChange: (value: number) => void }) => (
  <Box>
    {/* SP版: セクションヘッダー */}
    <Flex display={{ base: "flex", md: "none" }} align="center" gap={2} mb={2}>
      <Icon as={LuCircle} color="teal.500" boxSize={3} />
      <Text fontWeight="bold" fontSize="md">
        最低人員設定
      </Text>
    </Flex>

    <Flex align="center" gap={2} bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" p={3}>
      <Text color="gray.600" fontSize="sm">
        常に最低
      </Text>

      {/* PC版: number input */}
      <Input
        display={{ base: "none", md: "block" }}
        size="sm"
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        w="70px"
        textAlign="center"
      />

      {/* SP版: stepper */}
      <Flex display={{ base: "flex", md: "none" }} align="center" gap={2}>
        <IconButton
          variant="outline"
          size="xs"
          aria-label="減らす"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
        >
          <LuMinus />
        </IconButton>
        <Text fontWeight="medium" fontSize="sm" minW="2ch" textAlign="center">
          {value}
        </Text>
        <IconButton
          variant="outline"
          size="xs"
          aria-label="増やす"
          colorPalette="teal"
          onClick={() => onChange(value + 1)}
        >
          <LuPlus />
        </IconButton>
      </Flex>

      <Text color="gray.600" fontSize="sm">
        人を配置
      </Text>
    </Flex>
  </Box>
);

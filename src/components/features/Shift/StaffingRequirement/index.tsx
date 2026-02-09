import { Box, Button, Container, Flex, Heading, Icon, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuCalendarDays, LuCopy, LuPencilLine, LuRefreshCw, LuRotateCcw, LuSave, LuSettings } from "react-icons/lu";
import { useDialog } from "@/src/components/ui/Dialog";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import { CopyModal } from "./CopyModal";
import { DAY_LABELS } from "./constants";
import { DayTabs } from "./DayTabs";
import { RegenerateModal } from "./RegenerateModal";
import { StaffingTable } from "./StaffingTable";
import { SummaryBar } from "./SummaryBar";
import type { AIInput, PositionType, ShopType, StaffingEntry } from "./types";
import { calculateWeeklySummary } from "./utils/summaryCalculations";
import { WeeklyHeatmap } from "./WeeklyHeatmap";

// Convex DBから取得されるフラット化された必要人員レコード
type RequiredStaffingFlat = {
  _id: string;
  shopId: string;
  dayOfWeek: number;
  hour: number;
  position: string;
  requiredCount: number;
};

type StaffingRequirementProps = {
  shopId: string;
  shop: ShopType;
  positions: PositionType[];
  initialStaffing: RequiredStaffingFlat[];
  onSave: (params: { dayOfWeek: number; staffing: StaffingEntry[]; aiInput?: AIInput }) => Promise<void>;
  onCopy: (params: { sourceDayOfWeek: number; targetDaysOfWeek: number[] }) => Promise<void>;
  onResetSetup?: () => void;
  isSaving?: boolean;
  isCopying?: boolean;
};

export const StaffingRequirement = ({
  shopId,
  shop,
  positions,
  initialStaffing,
  onSave,
  onCopy,
  onResetSetup,
  isSaving = false,
  isCopying = false,
}: StaffingRequirementProps) => {
  // ビューモード（週間俯瞰 / 日別編集）
  const [viewMode, setViewMode] = useState<"weekly" | "daily">("daily");

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

  // 週間サマリー
  const summary = useMemo(
    () => calculateWeeklySummary({ staffingMap, hours, positions }),
    [staffingMap, hours, positions],
  );

  // 選択中の曜日のstaffing配列を生成
  const currentDayStaffing = useMemo(() => {
    const result: StaffingEntry[] = [];
    for (const hour of hours) {
      for (const pos of positions) {
        const key = `${selectedDay}-${hour}-${pos.name}`;
        result.push({ hour, position: pos.name, requiredCount: staffingMap[key] ?? 0 });
      }
    }
    return result;
  }, [staffingMap, selectedDay, hours, positions]);

  // StaffingTableからの変更を受け取る
  const handleStaffingChange = (newStaffing: StaffingEntry[]) => {
    setStaffingMap((prev) => {
      const newMap = { ...prev };
      for (const entry of newStaffing) {
        const key = `${selectedDay}-${entry.hour}-${entry.position}`;
        newMap[key] = entry.requiredCount;
      }
      return newMap;
    });
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

      {/* 週間サマリー */}
      <SummaryBar
        weeklyTotalPersonHours={summary.weeklyTotalPersonHours}
        peakInfo={summary.peakInfo}
        configuredDaysCount={summary.configuredDaysCount}
      />

      {/* ビューモード切替 */}
      <Flex mb={4} gap={2}>
        <Button
          size="sm"
          variant={viewMode === "weekly" ? "solid" : "outline"}
          colorPalette={viewMode === "weekly" ? "teal" : "gray"}
          onClick={() => setViewMode("weekly")}
        >
          <Icon as={LuCalendarDays} />
          週間俯瞰
        </Button>
        <Button
          size="sm"
          variant={viewMode === "daily" ? "solid" : "outline"}
          colorPalette={viewMode === "daily" ? "teal" : "gray"}
          onClick={() => setViewMode("daily")}
        >
          <Icon as={LuPencilLine} />
          日別編集
        </Button>
      </Flex>

      {/* 週間俯瞰モード */}
      {viewMode === "weekly" && (
        <WeeklyHeatmap
          staffingMap={staffingMap}
          hours={hours}
          positions={positions}
          onSelectDay={(day) => {
            setSelectedDay(day);
            setViewMode("daily");
          }}
        />
      )}

      {/* 日別編集モード */}
      {viewMode === "daily" && (
        <>
          {/* 曜日タブ + アクションボタン */}
          <Flex mb={4} justify="space-between" align="center" wrap="wrap" gap={3}>
            <DayTabs selectedDay={selectedDay} onChange={setSelectedDay} />

            <Flex gap={2}>
              {onResetSetup && (
                <Button variant="ghost" size="sm" onClick={onResetSetup}>
                  <Icon as={LuRotateCcw} />
                  初期設定をやり直す
                </Button>
              )}
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

          {/* 必要人員テーブル（PC: Table形式 / SP: Card形式） */}
          <StaffingTable
            openTime={shop.openTime}
            closeTime={shop.closeTime}
            positions={positions}
            staffing={currentDayStaffing}
            onChange={handleStaffingChange}
          />
        </>
      )}

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

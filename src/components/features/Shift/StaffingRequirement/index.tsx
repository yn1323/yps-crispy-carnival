import { Box, Button, Container, Flex, Heading, Icon, SegmentGroup, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuCopy, LuRefreshCw, LuRotateCcw, LuSave, LuSettings } from "react-icons/lu";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import { CopyModal } from "./CopyModal";
import { DAY_COUNT } from "./constants";
import { DayTabs } from "./DayTabs";
import { RegenerateModal } from "./RegenerateModal";
import { StaffingTable } from "./StaffingTable";
import type { AIInput, PositionType, ShopType, StaffingEntry } from "./types";
import { WeeklyHeatmap } from "./WeeklyHeatmap";

const VIEW_OPTIONS = [
  { value: "daily", label: "日別" },
  { value: "overview", label: "一覧" },
];

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
  // ビューモード（日別 / 一覧）
  const [viewMode, setViewMode] = useState<"daily" | "overview">("daily");

  // 曜日タブ選択（月曜=1をデフォルト）
  const [selectedDay, setSelectedDay] = useState(1);

  // モーダル管理
  const copyModal = useDialog();
  const regenerateModal = useDialog();
  const resetDialog = useDialog();
  const unsavedDialog = useDialog();

  // 未保存警告時の移動先曜日
  const [pendingDay, setPendingDay] = useState<number | null>(null);

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

  // 設定済み曜日の算出（DayTabsの濃淡表示用）
  const configuredDays = useMemo(() => {
    const days: number[] = [];
    for (let day = 0; day < DAY_COUNT; day++) {
      const hasData = hours.some((hour) =>
        positions.some((pos) => (staffingMap[`${day}-${hour}-${pos.name}`] ?? 0) > 0),
      );
      if (hasData) days.push(day);
    }
    return days;
  }, [staffingMap, hours, positions]);

  // 選択中の曜日の初期値（変更ハイライト用）
  const currentDayInitialStaffing = useMemo(() => {
    const result: StaffingEntry[] = [];
    for (const item of initialStaffing) {
      if (item.dayOfWeek === selectedDay) {
        result.push({ hour: item.hour, position: item.position, requiredCount: item.requiredCount });
      }
    }
    return result;
  }, [initialStaffing, selectedDay]);

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

  // 曜日タブ切替（未保存チェック付き）
  const handleDayChange = (newDay: number) => {
    if (hasChanges) {
      setPendingDay(newDay);
      unsavedDialog.open();
    } else {
      setSelectedDay(newDay);
    }
  };

  // 未保存の変更を破棄して移動
  const handleDiscardAndMove = () => {
    if (pendingDay === null) return;
    // 現在の曜日のデータを初期値に復元
    setStaffingMap((prev) => {
      const newMap = { ...prev };
      // まず現曜日のキーをすべて0にリセット
      for (const hour of hours) {
        for (const pos of positions) {
          const key = `${selectedDay}-${hour}-${pos.name}`;
          newMap[key] = 0;
        }
      }
      // 初期値で上書き
      for (const item of initialStaffing) {
        if (item.dayOfWeek === selectedDay) {
          const key = `${item.dayOfWeek}-${item.hour}-${item.position}`;
          newMap[key] = item.requiredCount;
        }
      }
      return newMap;
    });
    setSelectedDay(pendingDay);
    setHasChanges(false);
    setPendingDay(null);
    unsavedDialog.close();
  };

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

      {/* ビューモード切替 */}
      <Flex mb={4}>
        <SegmentGroup.Root
          size="sm"
          value={viewMode}
          onValueChange={(e) => setViewMode(e.value as "daily" | "overview")}
        >
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={VIEW_OPTIONS} cursor="pointer" />
        </SegmentGroup.Root>
      </Flex>

      {/* 一覧モード */}
      {viewMode === "overview" && (
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

      {/* 日別モード */}
      {viewMode === "daily" && (
        <>
          {/* 曜日タブ + アクションボタン */}
          <Flex mb={4} justify="space-between" align="center" wrap="wrap" gap={3}>
            <DayTabs selectedDay={selectedDay} onChange={handleDayChange} configuredDays={configuredDays} />

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

          {/* 必要人員テーブル（PC: Table形式 / SP: Card形式） */}
          <StaffingTable
            openTime={shop.openTime}
            closeTime={shop.closeTime}
            positions={positions}
            staffing={currentDayStaffing}
            onChange={handleStaffingChange}
            initialStaffing={currentDayInitialStaffing}
          />

          {/* アクションバー（テーブル下部に固定表示） */}
          <Flex
            position="sticky"
            bottom={0}
            zIndex={10}
            bg="white"
            borderTop="1px solid"
            borderColor="gray.200"
            py={3}
            mt={2}
            mx={-4}
            px={4}
            boxShadow="0 -2px 4px rgba(0,0,0,0.04)"
            justify="space-between"
            align="center"
            wrap="wrap"
            gap={2}
          >
            {onResetSetup ? (
              <Button variant="outline" size="sm" colorPalette="red" onClick={resetDialog.open}>
                <Icon as={LuRotateCcw} />
                初期設定をやり直す
              </Button>
            ) : (
              <Box />
            )}
            <Flex gap={3} align="center">
              {hasChanges && (
                <Text fontSize="sm" color="orange.600" fontWeight="medium" display={{ base: "none", md: "block" }}>
                  未保存の変更があります
                </Text>
              )}
              <Button colorPalette="teal" onClick={handleSave} disabled={!hasChanges} loading={isSaving}>
                <Icon as={LuSave} />
                保存する
              </Button>
            </Flex>
          </Flex>
        </>
      )}

      {/* 未保存警告ダイアログ */}
      <Dialog
        title="未保存の変更があります"
        isOpen={unsavedDialog.isOpen}
        onOpenChange={unsavedDialog.onOpenChange}
        onClose={() => {
          setPendingDay(null);
          unsavedDialog.close();
        }}
        onSubmit={handleDiscardAndMove}
        submitLabel="破棄して移動"
        submitColorPalette="red"
        role="alertdialog"
      >
        <Text>現在の曜日に未保存の変更があります。変更を破棄して移動しますか？</Text>
      </Dialog>

      {/* 初期設定リセット確認ダイアログ */}
      <Dialog
        title="初期設定をやり直しますか？"
        isOpen={resetDialog.isOpen}
        onOpenChange={resetDialog.onOpenChange}
        onClose={resetDialog.close}
        onSubmit={() => {
          onResetSetup?.();
          resetDialog.close();
        }}
        submitLabel="やり直す"
        submitColorPalette="red"
        role="alertdialog"
      >
        <Text>すべての必要人員設定が削除され、最初からやり直しになります。</Text>
        <Text fontWeight="bold" color="red.600" mt={2}>
          この操作は取り消せません。
        </Text>
      </Dialog>

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
    </Container>
  );
};

import { Box, Button, Container, Flex, Heading, Icon, SegmentGroup, Text, VStack } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuCopy, LuMenu, LuRefreshCw, LuRotateCcw, LuSave, LuSettings } from "react-icons/lu";
import { BottomSheet, useBottomSheet } from "@/src/components/ui/BottomSheet";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import { CopyModal } from "./CopyModal";
import { DayTabs } from "./DayTabs";
import { MobileActionBar } from "./MobileActionBar";
import { RegenerateModal } from "./RegenerateModal";
import { StaffingTable } from "./StaffingTable";
import type { AIInput, PositionType, ShopType, StaffingEntry } from "./types";
import { useDayNavigation } from "./useDayNavigation";
import { type RequiredStaffingFlat, useStaffingData } from "./useStaffingData";
import { generateHourRange } from "./utils/timeHelpers";
import { WeeklyHeatmap } from "./WeeklyHeatmap";

const VIEW_OPTIONS = [
  { value: "daily", label: "日別" },
  { value: "overview", label: "一覧" },
];

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
  const [viewMode, setViewMode] = useState<"daily" | "overview">("daily");
  const [selectedDay, setSelectedDay] = useState(1);
  const [aiInput, setAiInput] = useState({ shopType: "", customerCount: "" });

  const hours = useMemo(() => generateHourRange(shop.openTime, shop.closeTime), [shop.openTime, shop.closeTime]);

  const copyModal = useDialog();
  const regenerateModal = useDialog();
  const resetDialog = useDialog();
  const actionsSheet = useBottomSheet();

  const {
    staffingMap,
    hasChanges,
    setHasChanges,
    configuredDays,
    currentDayStaffing,
    currentDayInitialStaffing,
    handleStaffingChange,
    buildStaffingArray,
    resetCurrentDay,
    copyToTargetDays,
    applyRegenerated,
  } = useStaffingData({ initialStaffing, selectedDay, hours, positions });

  const { unsavedDialog, handleDayChange, handleDiscardAndMove, handleCancelDiscard } = useDayNavigation({
    setSelectedDay,
    hasChanges,
    onResetCurrentDay: resetCurrentDay,
  });

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
      await onSave({
        dayOfWeek: selectedDay,
        staffing: buildStaffingArray(selectedDay),
      });
      await onCopy({
        sourceDayOfWeek: selectedDay,
        targetDaysOfWeek: targetDays,
      });
      copyToTargetDays(targetDays);
      copyModal.close();
    } catch {
      // エラーはpages側でハンドリング済み
    }
  };

  // AI再生成処理
  const handleRegenerate = (result: StaffingEntry[], newAiInput: AIInput) => {
    applyRegenerated(result);
    setAiInput(newAiInput);
    regenerateModal.close();
    toaster.create({ description: "AIで再生成しました", type: "success" });
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

      {/* ビューモード切替 + SP用メニューボタン */}
      <Flex mb={4} justify="space-between" align="center">
        <SegmentGroup.Root
          size="sm"
          value={viewMode}
          onValueChange={(e) => setViewMode(e.value as "daily" | "overview")}
        >
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={VIEW_OPTIONS} cursor="pointer" />
        </SegmentGroup.Root>

        <Button variant="outline" size="sm" display={{ base: "flex", md: "none" }} onClick={actionsSheet.open}>
          <Icon as={LuMenu} />
          メニュー
        </Button>
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
          {/* 曜日タブ + アクションボタン（PC） */}
          <Flex mb={4} justify="space-between" align="center" wrap="wrap" gap={3}>
            <DayTabs selectedDay={selectedDay} onChange={handleDayChange} configuredDays={configuredDays} />

            <Flex gap={2} display={{ base: "none", md: "flex" }}>
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

          {/* 必要人員テーブル（PC: Table形式 / SP: アコーディオン形式） */}
          <Box pb={{ base: "120px", md: 0 }}>
            <StaffingTable
              openTime={shop.openTime}
              closeTime={shop.closeTime}
              positions={positions}
              staffing={currentDayStaffing}
              onChange={handleStaffingChange}
              initialStaffing={currentDayInitialStaffing}
            />
          </Box>

          {/* PC: アクションバー */}
          <Flex
            display={{ base: "none", md: "flex" }}
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
                <Text fontSize="sm" color="orange.600" fontWeight="medium">
                  未保存の変更があります
                </Text>
              )}
              <Button colorPalette="teal" onClick={handleSave} disabled={!hasChanges} loading={isSaving}>
                <Icon as={LuSave} />
                保存する
              </Button>
            </Flex>
          </Flex>

          {/* SP: MobileActionBar */}
          <MobileActionBar onSave={handleSave} hasChanges={hasChanges} isSaving={isSaving} />
        </>
      )}

      {/* 未保存警告ダイアログ */}
      <Dialog
        title="未保存の変更があります"
        isOpen={unsavedDialog.isOpen}
        onOpenChange={unsavedDialog.onOpenChange}
        onClose={handleCancelDiscard}
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

      {/* SP: メニューBottomSheet */}
      <BottomSheet title="メニュー" isOpen={actionsSheet.isOpen} onOpenChange={actionsSheet.onOpenChange}>
        <VStack gap={3} align="stretch">
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              actionsSheet.close();
              copyModal.open();
            }}
          >
            <Icon as={LuCopy} />
            他の曜日にコピー
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              actionsSheet.close();
              regenerateModal.open();
            }}
          >
            <Icon as={LuRefreshCw} />
            AIで作り直す
          </Button>
          {onResetSetup && (
            <Button
              variant="outline"
              size="lg"
              colorPalette="red"
              onClick={() => {
                actionsSheet.close();
                resetDialog.open();
              }}
            >
              <Icon as={LuRotateCcw} />
              初期設定をやり直す
            </Button>
          )}
        </VStack>
      </BottomSheet>

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

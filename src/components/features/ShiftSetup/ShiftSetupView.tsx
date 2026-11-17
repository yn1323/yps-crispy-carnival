import { Box, Stack, Text } from "@chakra-ui/react";
import { LuSlidersHorizontal } from "react-icons/lu";
import { ReadOnlyNotice } from "@/src/components/shared/ReadOnlyNotice";
import { AUTHENTICATED_APP_BOTTOM_INSET } from "@/src/components/templates/AuthenticatedAppShell";
import { AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT } from "@/src/components/templates/AuthenticatedPageContent";
import { AUTHENTICATED_APP_HEADER_HEIGHT } from "@/src/components/templates/Header";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";
import { useHideOnScrollDown } from "@/src/hooks/useHideOnScrollDown";
import { AssistDialog } from "./AssistDialog";
import { DayTemplatesSection } from "./DayTemplatesSection";
import { LeaveConfirmationDialog, PendingChangesActions } from "./PendingChanges";
import { PositionsSection } from "./PositionsSection";
import { StaffProfilesSection } from "./StaffProfilesSection";
import { getShiftSetupReadOnlyReason } from "./script";
import type { LeaveDialogState, ShiftSetupEditorView } from "./types";

type Props = ShiftSetupEditorView & {
  leaveDialog: LeaveDialogState;
  onBack: () => void;
};

/** 下端に留める保存の行の地色。ページと同じ色にして、下を流れる内容が透けないようにする。 */
const SAVE_BAR_SURFACE = { bg: "gray.50" } as const;

export function ShiftSetupView({
  setup,
  savedPositions,
  canWrite,
  dayTemplates,
  staffProfiles,
  pendingSections,
  isSaving,
  positionsDialog,
  assistDialog,
  leaveDialog,
  intents,
  onBack,
}: Props) {
  // アプリのヘッダーは下へスクロールすると隠れる。隠れている間は、留める位置を画面の上端まで上げる。
  const isAppHeaderHidden = useHideOnScrollDown();
  const stickyTop = isAppHeaderHidden ? "0px" : AUTHENTICATED_APP_HEADER_HEIGHT.base;

  return (
    // 保存の行は、内容が短いページでも画面の下端に置くため、ページの高さを画面いっぱいに取る。
    // 閲覧専用では保存の行がないため、最後のセクションの下に余白を取り、ページの終わりが画面の下端に張り付かないようにする。
    <Stack
      gap={{ base: 4, md: 6 }}
      minH={canWrite ? AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT : undefined}
      pb={canWrite ? 0 : { base: 10, md: 16 }}
    >
      <DetailPageHeader title="シフト作成の設定" onBack={onBack} icon={LuSlidersHorizontal} />

      {!canWrite && (
        <ReadOnlyNotice
          title="シフト作成の設定は閲覧のみです"
          description={getShiftSetupReadOnlyReason(setup.businessWriteBlockReason)}
        />
      )}

      <Text fontSize="sm" color="fg.muted" lineHeight="tall">
        詳細にシフトを作成するため設定です。 シフトの「くわしく」表示で利用します。
      </Text>

      <PositionsSection
        positions={setup.positions}
        savedPositions={savedPositions}
        canWrite={canWrite}
        isSaving={isSaving}
        dialog={positionsDialog}
        onApply={intents.onApplyPositions}
      />
      <DayTemplatesSection
        setup={setup}
        canWrite={canWrite}
        isSaving={isSaving}
        dayTemplates={dayTemplates}
        intents={intents}
        onOpenAssist={assistDialog.open}
      />
      <StaffProfilesSection
        staffs={setup.staffs}
        positions={setup.positions}
        profiles={staffProfiles}
        canWrite={canWrite}
        isSaving={isSaving}
        headerStickyTop={stickyTop}
        intents={intents}
      />

      {canWrite && (
        // スクロールしても保存できるよう、保存の操作を画面の下端に留める。スマートフォンでは下部メニューのすぐ上に置く。
        <Box
          data-sticky-row=""
          position="sticky"
          bottom={AUTHENTICATED_APP_BOTTOM_INSET}
          zIndex="docked"
          // 内容が短いページでは、余った高さの下へ寄せる。
          mt="auto"
          // ページの左右と下の余白（16px）を打ち消し、端まで地色を敷く。
          mx={-4}
          mb={-4}
          px={4}
          py={3}
          bg={SAVE_BAR_SURFACE.bg}
          borderTopWidth="1px"
          borderColor="gray.200"
        >
          <PendingChangesActions sections={pendingSections} isSaving={isSaving} onSave={intents.onSaveChanges} />
        </Box>
      )}

      <AssistDialog
        dialog={{ ...assistDialog, isOpen: assistDialog.isOpen && canWrite }}
        hasTemplates={dayTemplates.drafts.length > 0}
        onRequest={intents.onRequestAssist}
      />
      <LeaveConfirmationDialog dialog={leaveDialog} sections={pendingSections} />
    </Stack>
  );
}

export function ShiftSetupSkeleton() {
  // 直前に出る画面全体の読み込み表示と同じ位置・大きさに、ロゴを上下左右の中央へ置く。
  return <ShiftoriLoading variant="section" message="Loading..." minH={AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT} />;
}

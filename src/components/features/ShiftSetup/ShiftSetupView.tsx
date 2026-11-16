import { Box, Stack } from "@chakra-ui/react";
import { LuSlidersHorizontal } from "react-icons/lu";
import { ReadOnlyNotice } from "@/src/components/shared/ReadOnlyNotice";
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

/** PCで上端に留める見出しの行の高さ（px）。見出しのボタン44px、上下の余白16px、下の罫線1px。 */
const PAGE_HEADER_ROW_HEIGHT_PX = 61;
/** 上端に留める行の、ページの地色と境界。下を流れる内容と見分けられるようにする。 */
const STICKY_SURFACE = { bg: "gray.50", borderBottomWidth: "1px", borderColor: "blackAlpha.200" } as const;

export function ShiftSetupView({
  setup,
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
  const stickyTransition = {
    transition: "top 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    "@media (prefers-reduced-motion: reduce)": { transition: "none" },
  };

  return (
    <Stack gap={{ base: 4, md: 6 }}>
      {canWrite ? (
        // スクロールしても保存できるよう、保存の操作を画面の上端に留める。
        // PCは見出しの行ごと留める。スマートフォンは見出しと操作が1行に収まらないため、操作の行だけを留める。
        <Box
          display={{ base: "contents", md: "flex" }}
          alignItems="center"
          gap={3}
          position={{ md: "sticky" }}
          top={{ md: stickyTop }}
          zIndex={{ md: "docked" }}
          // ページの左右の余白（16px）を打ち消し、端まで地色を敷く。
          mx={{ md: -4 }}
          px={{ md: 4 }}
          py={{ md: 2 }}
          bg={{ md: STICKY_SURFACE.bg }}
          borderBottomWidth={{ md: STICKY_SURFACE.borderBottomWidth }}
          borderColor={STICKY_SURFACE.borderColor}
          css={stickyTransition}
        >
          <Box flex={1} minW={0}>
            <DetailPageHeader title="シフト作成の設定" onBack={onBack} icon={LuSlidersHorizontal} />
          </Box>
          <Box
            flexShrink={0}
            position={{ base: "sticky", md: "static" }}
            top={{ base: stickyTop, md: "auto" }}
            zIndex={{ base: "docked", md: "auto" }}
            // スマートフォンでは、見出しのすぐ下に続ける。
            mt={{ base: -3, md: 0 }}
            mx={{ base: -4, md: 0 }}
            px={{ base: 4, md: 0 }}
            py={{ base: 2, md: 0 }}
            bg={{ base: STICKY_SURFACE.bg, md: "transparent" }}
            borderBottomWidth={{ base: STICKY_SURFACE.borderBottomWidth, md: 0 }}
            borderColor={STICKY_SURFACE.borderColor}
            css={stickyTransition}
          >
            <PendingChangesActions
              sections={pendingSections}
              isSaving={isSaving}
              onReset={intents.onResetChanges}
              onSave={intents.onSaveChanges}
            />
          </Box>
        </Box>
      ) : (
        <DetailPageHeader title="シフト作成の設定" onBack={onBack} icon={LuSlidersHorizontal} />
      )}

      {!canWrite && (
        <ReadOnlyNotice
          title="シフト作成の設定は閲覧のみです"
          description={getShiftSetupReadOnlyReason(setup.businessWriteBlockReason)}
        />
      )}

      <PositionsSection
        positions={setup.positions}
        canWrite={canWrite}
        dialog={positionsDialog}
        onSave={intents.onSavePositions}
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
        // 表の見出しの行は、ページの見出しの行のすぐ下に留める。閲覧専用ではページの見出しを留めない。
        headerStickyTop={canWrite ? `calc(${stickyTop} + ${PAGE_HEADER_ROW_HEIGHT_PX}px)` : stickyTop}
        intents={intents}
      />

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
  return <ShiftoriLoading variant="section" message="Loading..." minH="full" />;
}

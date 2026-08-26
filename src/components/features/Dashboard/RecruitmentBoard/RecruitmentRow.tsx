import { Box, Menu, Portal, Stack } from "@chakra-ui/react";
import { LuEllipsisVertical, LuTrash2 } from "react-icons/lu";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { IconButton } from "@/src/components/ui/Button";
import { formatDateShort } from "@/src/domains/shift/date";
import { RecruitmentSummaryRow } from "./RecruitmentSummaryRow";

type Props = {
  recruitment: Recruitment;
  isReadOnly?: boolean;
  showMenu?: boolean;
  canDelete?: boolean;
  deleteDisabledReason?: string;
  dataTour?: string;
  shopName?: string;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onDeleteRecruitment: (recruitment: Recruitment) => void;
};

export function RecruitmentRow({
  recruitment,
  isReadOnly = false,
  showMenu,
  canDelete,
  deleteDisabledReason,
  dataTour,
  shopName,
  onOpenShiftBoard,
  onDeleteRecruitment,
}: Props) {
  const { _id, periodStart, periodEnd } = recruitment;
  const periodLabel = `${formatDateShort(periodStart)} 〜 ${formatDateShort(periodEnd)}`;
  const recruitmentLabel = shopName ? `${shopName}の${periodLabel}` : periodLabel;
  const isMenuVisible = showMenu ?? !isReadOnly;
  const isDeleteEnabled = (canDelete ?? !isReadOnly) && !deleteDisabledReason;
  const resolvedDeleteDisabledReason = isDeleteEnabled
    ? undefined
    : (deleteDisabledReason ?? (isReadOnly ? "現在、募集を削除できません" : "この募集は削除できません"));

  return (
    <RecruitmentSummaryRow
      recruitment={recruitment}
      dataTour={dataTour}
      shopName={shopName}
      ariaLabel={`${recruitmentLabel}のシフトを見る`}
      onClick={() => onOpenShiftBoard(_id)}
      endSlot={
        isMenuVisible ? (
          <Menu.Root positioning={{ placement: "bottom-end" }}>
            <Menu.Trigger asChild>
              <IconButton
                aria-label={`${recruitmentLabel}の募集操作メニュー`}
                variant="ghost"
                minW="44px"
                minH="44px"
                color="fg.muted"
              >
                <LuEllipsisVertical size={20} />
              </IconButton>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner>
                <Menu.Content minW="180px">
                  <Menu.Item
                    value="delete"
                    color={isDeleteEnabled ? "red.600" : "fg.muted"}
                    cursor={isDeleteEnabled ? "pointer" : "not-allowed"}
                    disabled={!isDeleteEnabled}
                    onSelect={isDeleteEnabled ? () => onDeleteRecruitment(recruitment) : undefined}
                  >
                    <LuTrash2 />
                    <Stack gap={0.5} minW={0}>
                      <Box>募集を削除</Box>
                      {resolvedDeleteDisabledReason && (
                        <Box fontSize="xs" color="fg.muted" lineHeight="short" whiteSpace="normal">
                          {resolvedDeleteDisabledReason}
                        </Box>
                      )}
                    </Stack>
                  </Menu.Item>
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
        ) : undefined
      }
    />
  );
}

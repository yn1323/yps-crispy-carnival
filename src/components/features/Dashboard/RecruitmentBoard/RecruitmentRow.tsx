import { Menu, Portal } from "@chakra-ui/react";
import { LuEllipsisVertical, LuTrash2 } from "react-icons/lu";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { IconButton } from "@/src/components/ui/Button";
import { formatDateShort } from "@/src/domains/shift/date";
import { RecruitmentSummaryRow } from "./RecruitmentSummaryRow";

type Props = {
  recruitment: Recruitment;
  isReadOnly?: boolean;
  dataTour?: string;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onDeleteRecruitment: (recruitment: Recruitment) => void;
};

export function RecruitmentRow({
  recruitment,
  isReadOnly = false,
  dataTour,
  onOpenShiftBoard,
  onDeleteRecruitment,
}: Props) {
  const { _id, periodStart, periodEnd } = recruitment;
  const periodLabel = `${formatDateShort(periodStart)} 〜 ${formatDateShort(periodEnd)}`;

  return (
    <RecruitmentSummaryRow
      recruitment={recruitment}
      dataTour={dataTour}
      ariaLabel={`${periodLabel}のシフトを見る`}
      onClick={() => onOpenShiftBoard(_id)}
      endSlot={
        isReadOnly ? undefined : (
          <Menu.Root positioning={{ placement: "bottom-end" }}>
            <Menu.Trigger asChild>
              <IconButton aria-label={`${periodLabel}の募集操作メニュー`} variant="ghost" size="sm" color="fg.muted">
                <LuEllipsisVertical />
              </IconButton>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner>
                <Menu.Content minW="180px">
                  <Menu.Item
                    value="delete"
                    color="red.600"
                    cursor="pointer"
                    onClick={() => onDeleteRecruitment(recruitment)}
                  >
                    <LuTrash2 />
                    募集を削除
                  </Menu.Item>
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
        )
      }
    />
  );
}

import { Icon } from "@chakra-ui/react";
import { LuSparkles } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

/** PCの上の行に置く、自動作成のダイアログを開くボタン。下書き保存と同じ強さにし、確定より目立たせない。 */
export const AutoCreateButton = ({ onClick }: { onClick: () => void }) => (
  <Button size="sm" variant="outline" onClick={onClick} h="32px" px={3} gap={1.5} data-tour="auto-create-button">
    <Icon boxSize={4} aria-hidden="true">
      <LuSparkles focusable="false" />
    </Icon>
    自動作成
  </Button>
);

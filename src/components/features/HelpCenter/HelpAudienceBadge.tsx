import { Badge } from "@chakra-ui/react";
import type { HelpAudience } from "./helpTasks";

export function HelpAudienceBadge({ audience }: { audience: HelpAudience }) {
  const label = audience === "manager" ? "管理者向け" : audience === "staff" ? "スタッフ向け" : "すべての方";
  const colorPalette = audience === "manager" ? "teal" : audience === "staff" ? "blue" : "gray";

  return (
    <Badge
      colorPalette={colorPalette}
      variant="subtle"
      bg={audience === "manager" ? "teal.100" : undefined}
      borderRadius="full"
      px={2.5}
    >
      {label}
    </Badge>
  );
}

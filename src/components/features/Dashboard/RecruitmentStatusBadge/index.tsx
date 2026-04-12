import { Badge } from "@chakra-ui/react";
import type { RecruitmentDisplayStatus } from "../types";

const displayStatusConfig = {
  collecting: { label: "収集中", colorPalette: "teal" },
  "past-deadline": { label: "締切済み", colorPalette: "yellow" },
  confirmed: { label: "確定済み", colorPalette: "gray" },
} as const;

type Props = {
  status: RecruitmentDisplayStatus;
};

export function RecruitmentStatusBadge({ status }: Props) {
  const { label, colorPalette } = displayStatusConfig[status];
  return (
    <Badge colorPalette={colorPalette} variant="subtle" borderRadius="full" px={2.5} fontSize="xs">
      {label}
    </Badge>
  );
}

import { Box, Flex } from "@chakra-ui/react";
import { useState } from "react";
import {
  ConfirmButton,
  ExportButton,
  type Period,
  SaveButton,
  UnsubmittedStrip,
  type ViewMode,
  ViewTabs,
} from "./components";
import { DailyViewPC, DailyViewSP } from "./DailyView";
import { ListViewPC, ListViewSP } from "./ListView";
import { STAFFS } from "./mockData";

type Props = {
  initialView?: ViewMode;
  period?: Period;
};

const unsubmittedNames = STAFFS.filter((s) => s.status === "not_submitted").map((s) => s.name);

export const ShiftForm2 = ({ initialView = "list", period = "1m" }: Props) => {
  const [view, setView] = useState<ViewMode>(initialView);

  return (
    <>
      {/* 本実装で global header が載る際は、親側で
          <Box h="calc(100dvh - var(--header-h))"> で包み、
          ここを h="100%" に戻す想定。 */}
      <Box display={{ base: "none", lg: "flex" }} flexDirection="column" h="100dvh" overflow="hidden" bg="gray.50">
        <Shell view={view} setView={setView} period={period} compact={false}>
          {view === "daily" ? <DailyViewPC period={period} /> : <ListViewPC period={period} />}
        </Shell>
      </Box>
      <Box display={{ base: "flex", lg: "none" }} flexDirection="column" h="100dvh" overflow="hidden" bg="gray.50">
        <Shell view={view} setView={setView} period={period} compact={true}>
          {view === "daily" ? <DailyViewSP period={period} /> : <ListViewSP period={period} />}
        </Shell>
      </Box>
    </>
  );
};

type ShellProps = {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  period: Period;
  compact: boolean;
  children: React.ReactNode;
};

const Shell = ({ view, setView, compact, children }: ShellProps) => (
  <Flex direction="column" h="100%" minH={0}>
    <Flex
      px={compact ? 3 : 5}
      bg="white"
      borderBottomWidth="1px"
      borderColor="gray.200"
      align="center"
      gap={compact ? 2 : 3}
      flexShrink={0}
    >
      <ViewTabs value={view} onChange={setView} />
      <Flex ml="auto" gap={2} align="center" py={2} flexShrink={0}>
        <SaveButton compact={compact} />
        <ConfirmButton compact={compact} />
        <ExportButton compact={compact} />
      </Flex>
    </Flex>

    <Flex flex={1} minH={0} direction="column">
      {children}
    </Flex>
    {unsubmittedNames.length > 0 && <UnsubmittedStrip names={unsubmittedNames} />}
  </Flex>
);

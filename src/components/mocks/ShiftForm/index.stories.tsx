import { Box, Flex } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DailyPC, DailySP, unsubmittedNames } from "./DailyView";
import { ListPC, ListSP } from "./ListView";
import { DATES } from "./mockData";
import {
  AppHeader,
  AppHeaderSP,
  FilterButton,
  FrameBox,
  HeaderActions,
  PageTabs,
  type TabKey,
  UnsubmittedStrip,
  UnsubmittedStripSP,
} from "./parts";

const rangeLabel = `${DATES[0].d}(${DATES[0].w}) – ${DATES[DATES.length - 1].d}(${DATES[DATES.length - 1].w})`;

const PCApp = ({ initialTab = "daily" as TabKey }: { initialTab?: TabKey }) => {
  const [tab, setTab] = useState<TabKey>(initialTab);
  return (
    <FrameBox>
      <AppHeader />
      <Flex
        px={5}
        py={3}
        bg="white"
        borderBottomWidth="1px"
        borderColor="gray.100"
        align="center"
        gap={3}
        flexShrink={0}
      >
        <Box fontSize="11px" color="teal.700" fontWeight={700} letterSpacing="1px">
          シフト作成
        </Box>
        <Box fontSize="16px" fontWeight={700} color="gray.800">
          {rangeLabel}
        </Box>
        <Box px="8px" py="2px" borderRadius="999px" fontSize="10px" fontWeight={700} bg="gray.100" color="gray.600">
          下書き
        </Box>
        <Flex ml="auto" align="center" gap={2}>
          <FilterButton />
          <HeaderActions />
        </Flex>
      </Flex>
      <PageTabs active={tab} onChange={setTab} />
      <Flex flex={1} minH={0} direction="column">
        {tab === "daily" ? <DailyPC /> : <ListPC />}
      </Flex>
      {tab === "daily" && <UnsubmittedStrip names={unsubmittedNames()} />}
    </FrameBox>
  );
};

const SPApp = ({ initialTab = "daily" as TabKey }: { initialTab?: TabKey }) => {
  const [tab, setTab] = useState<TabKey>(initialTab);
  return (
    <FrameBox>
      <AppHeaderSP />
      <Flex
        px={3}
        py="10px"
        bg="white"
        borderBottomWidth="1px"
        borderColor="gray.100"
        align="center"
        gap={2}
        flexShrink={0}
      >
        <Box fontSize="13px" fontWeight={700} color="gray.800">
          {rangeLabel}
        </Box>
        <Flex ml="auto" gap={1}>
          <HeaderActions compact />
        </Flex>
      </Flex>
      <PageTabs compact active={tab} onChange={setTab} />
      <Box flex={1} minH={0} overflow="auto">
        {tab === "daily" ? <DailySP /> : <ListSP />}
      </Box>
      {tab === "daily" && <UnsubmittedStripSP names={unsubmittedNames()} />}
    </FrameBox>
  );
};

const meta = {
  title: "Mocks/ShiftForm",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const PC_Daily: Story = { render: () => <PCApp initialTab="daily" /> };
export const PC_List: Story = { render: () => <PCApp initialTab="list" /> };
export const SP_Daily: Story = {
  render: () => <SPApp initialTab="daily" />,
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
export const SP_List: Story = {
  render: () => <SPApp initialTab="list" />,
  parameters: { viewport: { defaultViewport: "mobile1" } },
};

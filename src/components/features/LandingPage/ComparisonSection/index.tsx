import { Box, Container, Flex, Grid, Icon, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import {
  LuArrowRight,
  LuBell,
  LuBellRing,
  LuCalendarRange,
  LuCheck,
  LuCircleUserRound,
  LuClipboardPenLine,
  LuEllipsis,
  LuFileSpreadsheet,
  LuFileText,
  LuLink2,
  LuMail,
  LuMailCheck,
  LuMessageCircleMore,
  LuMonitorCog,
  LuRefreshCw,
  LuSendHorizontal,
  LuSmartphone,
} from "react-icons/lu";
import { SectionHeading } from "../SectionHeading";

type ComparisonKind = "collection" | "reminder" | "adjustment" | "sharing";
type ComparisonTone = "before" | "after";

type ComparisonItem = {
  title: string;
  before: string;
  after: string;
  categoryIcon: IconType;
  kind: ComparisonKind;
};

const comparisonItems: ComparisonItem[] = [
  {
    title: "希望シフト回収",
    before: "紙・口頭・LINEでバラバラ",
    after: "LINE・メールでひとつに回収",
    categoryIcon: LuClipboardPenLine,
    kind: "collection",
  },
  {
    title: "催促",
    before: "個別に連絡が必要",
    after: "未提出者へ自動リマインド",
    categoryIcon: LuBell,
    kind: "reminder",
  },
  {
    title: "調整",
    before: "Excelへ転記して作成",
    after: "画面上でシフトを調整",
    categoryIcon: LuCalendarRange,
    kind: "adjustment",
  },
  {
    title: "共有",
    before: "確定後に個別送信・投稿",
    after: "確定後にLINE・メールで自動共有",
    categoryIcon: LuSendHorizontal,
    kind: "sharing",
  },
];

const desktopColumns = "minmax(150px, 1.1fr) minmax(0, 1.9fr) 64px minmax(0, 2.3fr)";
const mobileColumns = "minmax(0, 1fr) 36px minmax(0, 1fr)";

export const ComparisonSection = () => (
  <Box as="section" bg="white" py={14}>
    <Container maxW="7xl">
      <VStack gap={7}>
        <SectionHeading phrases={["紙・Excel・LINEチャットの", "シフト管理を統一"]} textAlign="center" />

        <ComparisonGrid />
      </VStack>
    </Container>
  </Box>
);

const ComparisonGrid = () => (
  <Box w="full">
    <Grid templateColumns={desktopColumns} gap={0} mb={3} hideBelow="md">
      <Box />
      <ComparisonHeader tone="before" />
      <Box />
      <ComparisonHeader tone="after" />
    </Grid>

    <VStack as="ol" align="stretch" gap={{ base: 7, md: 3 }} m={0} p={0} listStyleType="none">
      {comparisonItems.map((item, index) => (
        <ComparisonRow key={item.title} item={item} number={index + 1} />
      ))}
    </VStack>
  </Box>
);

const ComparisonRow = ({ item, number }: { item: ComparisonItem; number: number }) => (
  <Grid
    as="li"
    templateAreas={{
      base: '"category category category" "before arrow after"',
      md: '"category before arrow after"',
    }}
    templateColumns={{ base: mobileColumns, md: desktopColumns }}
    rowGap={{ base: 3, md: 0 }}
    alignItems="stretch"
  >
    <CategoryCell icon={item.categoryIcon} number={number} title={item.title} />
    <ComparisonPanel gridArea="before" tone="before" kind={item.kind} description={item.before} />
    <ComparisonArrow />
    <ComparisonPanel gridArea="after" tone="after" kind={item.kind} description={item.after} />
  </Grid>
);

const CategoryCell = ({ icon, number, title }: { icon: IconType; number: number; title: string }) => (
  <Flex
    gridArea="category"
    align="center"
    justify={{ base: "flex-start", md: "center" }}
    direction={{ base: "row", md: "column", xl: "row" }}
    gap={{ base: 2, md: 3, lg: 4 }}
    minH={{ md: "178px", lg: "196px" }}
    px={{ md: 3, lg: 4 }}
    bg={{ md: "white" }}
    borderWidth={{ md: "1px" }}
    borderColor="gray.200"
    borderRadius={{ md: "xl" }}
    borderEndRadius={{ md: 0 }}
  >
    <Flex
      hideFrom="md"
      align="center"
      justify="center"
      flexShrink={0}
      boxSize={8}
      color="teal.700"
      borderWidth="1px"
      borderColor="teal.600"
      borderRadius="full"
      fontSize="lg"
      fontWeight="bold"
    >
      {number}
    </Flex>
    <Flex
      hideBelow="md"
      align="center"
      justify="center"
      flexShrink={0}
      boxSize={{ md: "56px", lg: "64px", xl: "72px" }}
      bg="teal.50"
      borderRadius="full"
    >
      <Icon as={icon} boxSize={{ md: 7, lg: 8, xl: 9 }} color="teal.700" aria-hidden />
    </Flex>
    <Text
      as="h3"
      color="gray.950"
      fontSize={{ base: "lg", md: "md", lg: "lg" }}
      fontWeight="black"
      lineHeight="1.4"
      textAlign={{ md: "center", xl: "start" }}
    >
      {title}
    </Text>
  </Flex>
);

const ComparisonPanel = ({
  gridArea,
  tone,
  kind,
  description,
}: {
  gridArea: "before" | "after";
  tone: ComparisonTone;
  kind: ComparisonKind;
  description: string;
}) => {
  const isAfter = tone === "after";

  return (
    <Flex
      gridArea={gridArea}
      direction="column"
      minW={0}
      minH={{ base: "220px", sm: "236px", md: "178px", lg: "196px" }}
      bg={isAfter ? "teal.50" : "white"}
      borderWidth="1px"
      borderInlineStartWidth={{ md: isAfter ? "1px" : "0" }}
      borderColor="gray.200"
      borderRadius="xl"
      borderStartRadius={{ md: isAfter ? "xl" : 0 }}
      overflow="hidden"
      role="group"
      aria-label={isAfter ? "シフトリ" : "導入前"}
    >
      <ComparisonHeader tone={tone} compact />
      <Flex
        position="relative"
        flex="1"
        direction="column"
        align="center"
        justify="center"
        gap={{ base: 4, md: 5 }}
        px={{ base: 1.5, md: 4, lg: 6 }}
        py={{ base: 4, md: 5 }}
        textAlign="center"
      >
        {isAfter && <SuccessMark />}
        <ComparisonVisual kind={kind} tone={tone} />
        <Text
          color={isAfter ? "teal.700" : "gray.900"}
          fontSize={{ base: "sm", md: "sm", lg: "md" }}
          fontWeight={isAfter ? "black" : "bold"}
          lineHeight="1.55"
        >
          {description}
        </Text>
      </Flex>
    </Flex>
  );
};

const ComparisonHeader = ({ tone, compact = false }: { tone: ComparisonTone; compact?: boolean }) => {
  const isAfter = tone === "after";

  return (
    <Flex
      display={compact ? { base: "flex", md: "none" } : "flex"}
      align="center"
      justify="center"
      minH={compact ? 11 : 14}
      px={{ base: 2, md: 4 }}
      bg={isAfter ? "teal.600" : "gray.100"}
      color={isAfter ? "white" : "gray.950"}
      borderRadius={compact ? 0 : "xl"}
      textAlign="center"
      aria-hidden={compact || undefined}
    >
      <Text fontSize={compact ? "sm" : "lg"} fontWeight="black" lineHeight="1.4">
        {isAfter ? "シフトリ" : "導入前"}
      </Text>
    </Flex>
  );
};

const ComparisonArrow = () => (
  <Flex gridArea="arrow" align="center" justify="center" color="teal.700" aria-hidden>
    <Icon as={LuArrowRight} boxSize={{ base: 5, sm: 6, lg: 7 }} strokeWidth={2.5} />
  </Flex>
);

const SuccessMark = () => (
  <Flex
    position="absolute"
    insetBlockStart={{ base: 2.5, md: 3 }}
    insetInlineEnd={{ base: 2.5, md: 3 }}
    align="center"
    justify="center"
    boxSize={{ base: 7, md: 8, lg: 9 }}
    bg="teal.600"
    color="white"
    borderRadius="full"
  >
    <Icon as={LuCheck} boxSize={{ base: 4, lg: 5 }} strokeWidth={3} aria-hidden />
  </Flex>
);

const ComparisonVisual = ({ kind, tone }: { kind: ComparisonKind; tone: ComparisonTone }) => {
  if (tone === "after") {
    if (kind === "collection") {
      return <PhoneChannelVisual innerIcon={LuLink2} mailIcon={LuMail} />;
    }

    if (kind === "reminder") {
      return <AutomaticReminderVisual />;
    }

    if (kind === "adjustment") {
      return <Icon as={LuMonitorCog} boxSize={{ base: 12, sm: 14, lg: 16 }} color="teal.700" aria-hidden />;
    }

    return <PhoneChannelVisual innerIcon={LuBell} mailIcon={LuMailCheck} />;
  }

  if (kind === "collection") {
    return <IconSequence icons={[LuFileText, LuMessageCircleMore, LuFileSpreadsheet]} separator="ellipsis" />;
  }

  if (kind === "reminder") {
    return <IconSequence icons={[LuCircleUserRound, LuCircleUserRound, LuCircleUserRound]} separator="ellipsis" />;
  }

  if (kind === "adjustment") {
    return <IconSequence icons={[LuFileSpreadsheet, LuMonitorCog]} separator="arrow" />;
  }

  return <IconSequence icons={[LuCircleUserRound, LuMessageCircleMore, LuSendHorizontal]} separator="ellipsis" />;
};

const IconSequence = ({ icons, separator }: { icons: IconType[]; separator: "ellipsis" | "arrow" }) => (
  <Flex align="center" justify="center" gap={{ base: 0.5, md: 2, lg: 3 }} color="gray.800" aria-hidden>
    {icons.map((VisualIcon, index) => (
      <Box key={`${VisualIcon.name}-${index}`} display="contents">
        {index > 0 &&
          (separator === "ellipsis" ? (
            <Icon as={LuEllipsis} boxSize={{ base: "clamp(10px, 3vw, 16px)", lg: 5 }} color="gray.500" />
          ) : (
            <Icon as={LuArrowRight} boxSize={{ base: 4, lg: 6 }} color="gray.600" />
          ))}
        <Icon as={VisualIcon} boxSize={{ base: "clamp(24px, 8vw, 36px)", md: 10, lg: 12, xl: 14 }} strokeWidth={1.7} />
      </Box>
    ))}
  </Flex>
);

const PhoneChannelVisual = ({ innerIcon, mailIcon }: { innerIcon: IconType; mailIcon: IconType }) => (
  <Flex align="center" justify="center" gap={{ base: 3, md: 4, lg: 6 }} color="teal.700" aria-hidden>
    <Box position="relative" boxSize={{ base: 10, sm: 12, lg: 14 }}>
      <Icon as={LuSmartphone} boxSize="full" strokeWidth={1.8} />
      <Icon
        as={innerIcon}
        position="absolute"
        inset={0}
        m="auto"
        boxSize={{ base: 4, sm: 5, lg: 6 }}
        strokeWidth={2.2}
      />
    </Box>
    <Icon as={mailIcon} boxSize={{ base: 10, sm: 12, lg: 14 }} flexShrink={0} strokeWidth={1.8} />
  </Flex>
);

const AutomaticReminderVisual = () => (
  <Box position="relative" color="teal.700" aria-hidden>
    <Icon as={LuBellRing} boxSize={{ base: 12, sm: 14, lg: 16 }} strokeWidth={1.8} />
    <Flex
      position="absolute"
      insetInlineEnd={-2}
      insetBlockEnd={-1}
      align="center"
      justify="center"
      boxSize={{ base: 6, lg: 7 }}
      bg="teal.600"
      color="white"
      borderRadius="full"
    >
      <Icon as={LuRefreshCw} boxSize={{ base: 3.5, lg: 4 }} strokeWidth={2.5} />
    </Flex>
  </Box>
);

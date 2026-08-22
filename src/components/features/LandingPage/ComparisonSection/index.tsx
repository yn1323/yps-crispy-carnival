import { Box, Container, Flex, Grid, Icon, Image, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuArrowRight, LuBell, LuCalendarRange, LuClipboardPenLine, LuSendHorizontal } from "react-icons/lu";
import { SectionHeading } from "../SectionHeading";
import adjustmentAfterImage from "./adjustment-after.webp";
import adjustmentBeforeImage from "./adjustment-before.webp";
import collectionAfterImage from "./collection-after.webp";
import collectionBeforeImage from "./collection-before.webp";
import reminderAfterImage from "./reminder-after.webp";
import reminderBeforeImage from "./reminder-before.webp";
import sharingAfterImage from "./sharing-after.webp";
import sharingBeforeImage from "./sharing-before.webp";

type ComparisonTone = "before" | "after";

type ComparisonItem = {
  title: string;
  before: string;
  after: string;
  beforeImageSrc: string;
  afterImageSrc: string;
  categoryIcon: IconType;
};

const comparisonItems: ComparisonItem[] = [
  {
    title: "希望シフト回収",
    before: "紙・口頭・LINEでバラバラ",
    after: "LINE・メールでひとつに回収",
    beforeImageSrc: collectionBeforeImage,
    afterImageSrc: collectionAfterImage,
    categoryIcon: LuClipboardPenLine,
  },
  {
    title: "催促",
    before: "個別に連絡が必要",
    after: "未提出者へ自動リマインド",
    beforeImageSrc: reminderBeforeImage,
    afterImageSrc: reminderAfterImage,
    categoryIcon: LuBell,
  },
  {
    title: "調整",
    before: "Excelへ転記して作成",
    after: "画面上でシフトを調整",
    beforeImageSrc: adjustmentBeforeImage,
    afterImageSrc: adjustmentAfterImage,
    categoryIcon: LuCalendarRange,
  },
  {
    title: "共有",
    before: "確定後に個別送信・投稿",
    after: "確定後にLINE・メールで自動共有",
    beforeImageSrc: sharingBeforeImage,
    afterImageSrc: sharingAfterImage,
    categoryIcon: LuSendHorizontal,
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
    <ComparisonPanel gridArea="before" tone="before" imageSrc={item.beforeImageSrc} description={item.before} />
    <ComparisonArrow />
    <ComparisonPanel gridArea="after" tone="after" imageSrc={item.afterImageSrc} description={item.after} />
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
  imageSrc,
  description,
}: {
  gridArea: "before" | "after";
  tone: ComparisonTone;
  imageSrc: string;
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
        flex="1"
        direction="column"
        align="center"
        justify="center"
        gap={{ base: 4, md: 5 }}
        px={{ base: 1.5, md: 4, lg: 6 }}
        py={{ base: 4, md: 5 }}
        textAlign="center"
      >
        <ComparisonVisual imageSrc={imageSrc} />
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

const ComparisonVisual = ({ imageSrc }: { imageSrc: string }) => (
  <Flex align="center" justify="center" w="full" h={{ base: "104px", sm: "116px", md: "112px", lg: "132px" }}>
    <Image src={imageSrc} alt="" w="full" h="full" objectFit="contain" loading="lazy" decoding="async" />
  </Flex>
);

import { Box, Circle, Flex, HStack, Icon, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuBell, LuCalendarCheck, LuLink, LuMail, LuSmartphone, LuTabletSmartphone } from "react-icons/lu";
import heroSpImage from "@/src/assets/hero-sp.webp";

type HeroTopOffset = {
  base: string;
  md: string;
};

type QuickPoint = {
  icon: IconType;
  label: string;
};

type GuideItem = {
  icon: IconType;
  title: string;
  body: string;
};

const shiftreeDescription = "LINE・メールでシフト募集連絡、シフト確定連絡が届くサービスです。";
const staffGuideLead = "専用アプリダウンロード不要でかんたんに利用できます。";

const quickPoints: QuickPoint[] = [
  { icon: LuTabletSmartphone, label: "専用アプリ不要" },
  { icon: LuLink, label: "メール・LINEから操作" },
];

const guideItems: GuideItem[] = [
  {
    icon: LuBell,
    title: "シフト募集開始のお知らせ",
    body: "希望シフトの受付が始まると、提出依頼が届きます。",
  },
  {
    icon: LuCalendarCheck,
    title: "シフト確定のお知らせ",
    body: "シフトが確定すると、自分の勤務予定を確認できるリンクが届きます。",
  },
  {
    icon: LuMail,
    title: "メール・LINEでお知らせします",
    body: "お知らせは登録いただいたメール・LINEに届きます。",
  },
  {
    icon: LuSmartphone,
    title: "専用アプリが不要です",
    body: "専用アプリなしでシフトの提出・閲覧が可能です。",
  },
];

const flowItems = [
  { icon: LuMail, labelLines: ["提出依頼が届く"] },
  { icon: LuLink, labelLines: ["リンクから", "希望シフトを提出"] },
  { icon: LuBell, labelLines: ["確定シフトが届く"] },
  { icon: LuCalendarCheck, labelLines: ["出勤日を確認"] },
];

type StaffGuideContentProps = {
  heroTopOffset?: HeroTopOffset;
};

export function StaffGuideContent({ heroTopOffset }: StaffGuideContentProps) {
  return (
    <VStack align="stretch" gap={{ base: 5, md: 7 }}>
      <HeroSection topOffset={heroTopOffset} />
      <GuideSection />
      <UsageFlowSection />
    </VStack>
  );
}

function HeroSection({ topOffset }: { topOffset?: HeroTopOffset }) {
  const pt = topOffset
    ? {
        base: `calc(${topOffset.base} + 36px)`,
        md: `calc(${topOffset.md} + 40px)`,
      }
    : { base: 9, md: 10 };

  return (
    <Box
      position="relative"
      overflow="hidden"
      bgGradient="to-b"
      gradientFrom="#E6F7F5"
      gradientVia="#F3FBFA"
      gradientTo="white"
      w="100vw"
      mx="calc(50% - 50vw)"
    >
      <Flex
        maxW="960px"
        mx="auto"
        px={{ base: 9, md: 8 }}
        pt={pt}
        pb={{ base: 7, md: 9 }}
        gap={{ base: 6, md: 10 }}
        align={{ base: "stretch", md: "center" }}
        justify={{ md: "space-between" }}
        direction={{ base: "column", md: "row" }}
      >
        <VStack align="stretch" gap={5} flex={{ base: 1, md: "0 1 600px" }} maxW={{ md: "600px" }}>
          <Box>
            <Text as="h1" color="teal.900" fontSize={{ base: "3xl", md: "5xl" }} fontWeight="bold" lineHeight={1.25}>
              シフトリのご案内
            </Text>
            <Text mt={4} color="gray.800" fontSize={{ base: "md", md: "lg" }} lineHeight={1.9}>
              {shiftreeDescription}
            </Text>
            <Text mt={3} color="gray.700" fontSize={{ base: "sm", md: "md" }} lineHeight={1.9} whiteSpace="pre-line">
              {staffGuideLead}
            </Text>
          </Box>
          <Box aria-hidden="true" display={{ base: "block", md: "none" }} alignSelf="center" w="150px">
            <Image src={heroSpImage} alt="" w="full" h="auto" objectFit="contain" />
          </Box>
          <Flex
            direction={{ base: "column", sm: "row" }}
            align={{ base: "stretch", sm: "center" }}
            justify={{ base: "flex-start", sm: "space-around" }}
            rowGap={2}
            columnGap={{ sm: 6, md: 8 }}
            w="full"
            px={{ base: 0, sm: 2, md: 4 }}
          >
            {quickPoints.map((item) => (
              <QuickPointItem key={item.label} item={item} />
            ))}
          </Flex>
        </VStack>

        <Box
          aria-hidden="true"
          display={{ base: "none", md: "flex" }}
          justifyContent="center"
          flex={{ md: "0 0 240px" }}
        >
          <Image src={heroSpImage} alt="" w="180px" maxW="full" h="auto" objectFit="contain" />
        </Box>
      </Flex>
    </Box>
  );
}

function QuickPointItem({ item }: { item: QuickPoint }) {
  return (
    <HStack gap={3} align="center" justify={{ base: "flex-start", sm: "center" }} px={1} py={2} minH="56px">
      <Circle size="40px" bg="teal.50" color="teal.700" flexShrink={0}>
        <Icon as={item.icon} boxSize={6} />
      </Circle>
      <Text color="teal.900" fontSize="sm" fontWeight="bold" lineHeight={1.5}>
        {item.label}
      </Text>
    </HStack>
  );
}

function GuideSection() {
  return (
    <Box px={{ base: 5, md: 8 }} py={6}>
      <Text as="h2" color="teal.900" fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold" textAlign="center">
        シフトリでできること
      </Text>
      <VStack align="stretch" gap={0} mt={{ base: 4, md: 6 }}>
        {guideItems.map((item, index) => (
          <GuideRow key={item.title} index={index + 1} item={item} isLast={index === guideItems.length - 1} />
        ))}
      </VStack>
    </Box>
  );
}

function GuideRow({ index, item, isLast }: { index: number; item: GuideItem; isLast: boolean }) {
  return (
    <Flex gap={{ base: 4, md: 6 }} py={{ base: 5, md: 6 }} borderBottomWidth={isLast ? 0 : 1} borderColor="gray.100">
      <Circle size={{ base: "56px", md: "92px" }} bg="teal.50" flexShrink={0}>
        <Icon as={item.icon} color="teal.600" boxSize={{ base: 7, md: 10 }} />
      </Circle>
      <Flex gap={{ base: 3, md: 4 }} align="flex-start" flex={1}>
        <Circle size="32px" bg="teal.500" color="white" fontSize="sm" fontWeight="bold" flexShrink={0}>
          {String(index).padStart(2, "0")}
        </Circle>
        <Box>
          <Text color="teal.900" fontSize={{ base: "md", md: "xl" }} fontWeight="bold">
            {item.title}
          </Text>
          <Text mt={2} color="gray.800" fontSize={{ base: "sm", md: "md" }} lineHeight={1.9} whiteSpace="pre-line">
            {item.body}
          </Text>
        </Box>
      </Flex>
    </Flex>
  );
}

function UsageFlowSection() {
  return (
    <Box px={{ base: 5, md: 8 }} py={6}>
      <Text as="h2" color="teal.900" fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold" textAlign="center">
        操作の流れ
      </Text>
      <SimpleGrid columns={{ base: 2, md: 4 }} gap={{ base: 3, md: 4 }} mt={{ base: 4, md: 6 }} alignItems="stretch">
        {flowItems.map((item, index) => (
          <FlowCard key={item.labelLines.join("-")} item={item} index={index + 1} />
        ))}
      </SimpleGrid>
    </Box>
  );
}

function FlowCard({ item, index }: { item: (typeof flowItems)[number]; index: number }) {
  return (
    <Box h="full">
      <VStack
        gap={3}
        justify="center"
        minH={{ base: "132px", md: "148px" }}
        h="full"
        bg="white"
        borderWidth={1}
        borderColor="gray.200"
        borderRadius="xl"
        px={4}
        py={4}
      >
        <Circle size="28px" bg="teal.500" color="white" fontSize="sm" fontWeight="bold" alignSelf="flex-start">
          {index}
        </Circle>
        <Icon as={item.icon} color="teal.600" boxSize={8} />
        <Text color="gray.900" fontSize="sm" fontWeight="bold" lineHeight={1.6} textAlign="center">
          {item.labelLines.map((line) => (
            <Text as="span" key={line} display="block">
              {line}
            </Text>
          ))}
        </Text>
      </VStack>
    </Box>
  );
}

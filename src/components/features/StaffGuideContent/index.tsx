import { Box, Circle, Flex, HStack, Icon, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuBell, LuCalendarCheck, LuLink, LuMail, LuSmartphone, LuStore, LuTabletSmartphone } from "react-icons/lu";
import heroSpImage from "../LandingPage/hero-sp.webp";

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

const shiftreeDescription = "勤務先のお店がシフト希望の回収や確定シフトの共有に使うシフト管理サービスです。";

const quickPoints: QuickPoint[] = [
  { icon: LuTabletSmartphone, label: "専用アプリ不要" },
  { icon: LuLink, label: "LINE・メールからシフト提出" },
];

const guideItems: GuideItem[] = [
  {
    icon: LuStore,
    title: "シフトリとは",
    body: shiftreeDescription,
  },
  {
    icon: LuBell,
    title: "お店から連絡が届きます",
    body: "シフト希望の提出依頼、締切前のお知らせ、確定シフトなどが届きます。",
  },
  {
    icon: LuMail,
    title: "メールまたはLINEで届きます",
    body: "勤務先からメールやLINEでシフトに関する案内が届きます。",
  },
  {
    icon: LuSmartphone,
    title: "専用アプリなしで使えます",
    body: "届いたリンクからシフト希望の提出や確定シフトの確認ができます。",
  },
];

const flowItems = [
  { icon: LuMail, labelLines: ["メール・LINEが届く"] },
  { icon: LuLink, labelLines: ["添付のリンクを", "開く"] },
  { icon: LuCalendarCheck, labelLines: ["希望シフトを提出"] },
  { icon: LuBell, labelLines: ["確定シフトが届く"] },
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
          </Box>
          <Box aria-hidden="true" display={{ base: "block", md: "none" }} alignSelf="center" w="150px">
            <Image src={heroSpImage} alt="" w="full" h="auto" objectFit="contain" />
          </Box>
          <SimpleGrid columns={{ base: 1, sm: 2 }} gap={3}>
            {quickPoints.map((item) => (
              <QuickPointCard key={item.label} item={item} />
            ))}
          </SimpleGrid>
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

function QuickPointCard({ item }: { item: QuickPoint }) {
  return (
    <HStack gap={3} align="center" bg="white" borderRadius="xl" px={4} py={3} boxShadow="sm" minH="72px">
      <Icon as={item.icon} color="teal.500" boxSize={7} flexShrink={0} />
      <Text color="gray.900" fontSize="sm" fontWeight="bold" lineHeight={1.5}>
        {item.label}
      </Text>
    </HStack>
  );
}

function GuideSection() {
  return (
    <Box px={{ base: 5, md: 8 }} py={6}>
      <Text as="h2" color="teal.900" fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold" textAlign="center">
        シフトリとは？
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
          <Text mt={2} color="gray.800" fontSize={{ base: "sm", md: "md" }} lineHeight={1.9}>
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

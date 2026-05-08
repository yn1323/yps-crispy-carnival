import { Box, Container, Flex, Grid, Heading, Icon, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import {
  LuBell,
  LuCalendarDays,
  LuChevronRight,
  LuMenu,
  LuMessageCircle,
  LuMonitorPlay,
  LuUserPlus,
} from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import heroPcImage from "./hero-pc.webp";
import heroSpImage from "./hero-sp.webp";

const navItems = ["シフトリでできること", "使い方", "よくある質問"];

const heroBenefits = [
  {
    icon: LuMessageCircle,
    title: "スタッフはLINEで提出",
    body: "専用アプリのインストール不要",
  },
  {
    icon: LuCalendarDays,
    title: "シフト作成がかんたん",
    body: "自動集計で作成の手間を削減",
  },
  {
    icon: LuBell,
    title: "シフト確定をお知らせ",
    body: "LINEで自動通知されるから安心",
  },
];

export const HeroSection = () => (
  <Box
    as="section"
    position="relative"
    overflow="hidden"
    bgGradient="to-b"
    gradientFrom="#dff1ff"
    gradientVia="#f2fbfb"
    gradientTo="white"
    color="gray.950"
  >
    <Container position="relative" zIndex={1} maxW="7xl" pt={{ base: 5, md: 8 }} pb={{ base: 12, md: 16 }}>
      <Flex as="header" align="center" justify="space-between" gap={6}>
        <Brand />

        <Flex display={{ base: "none", md: "flex" }} align="center" gap={{ md: 7, lg: 9 }}>
          {navItems.map((item) => (
            <Text key={item} color="gray.950" textStyle="sm" fontWeight="bold">
              {item}
            </Text>
          ))}
          <Flex align="center" gap={3}>
            <Button type="button" h="48px" px={7} colorPalette="teal" borderRadius="full" fontWeight="bold">
              無料ではじめる
            </Button>
            <Button
              type="button"
              variant="outline"
              colorPalette="teal"
              h="48px"
              px={7}
              bg="whiteAlpha.500"
              borderRadius="full"
              fontWeight="bold"
            >
              デモを見る
            </Button>
          </Flex>
        </Flex>

        <Button
          type="button"
          display={{ base: "inline-flex", md: "none" }}
          variant="ghost"
          size="sm"
          aria-label="メニューを開く"
        >
          <Icon as={LuMenu} boxSize={7} />
        </Button>
      </Flex>

      <Grid
        mt={{ base: 9, md: 16 }}
        templateColumns={{ base: "1fr", lg: "minmax(0, 0.88fr) minmax(520px, 1.12fr)" }}
        gap={{ base: 8, lg: 10 }}
        alignItems="center"
      >
        <VStack align={{ base: "stretch", lg: "start" }} gap={{ base: 7, md: 8 }}>
          <VStack align={{ base: "stretch", lg: "start" }} gap={{ base: 5, md: 6 }}>
            <Heading as="h1" textStyle="heroTitle" lineHeight="1.15" letterSpacing="0">
              シフト作成を、
              <Box as="span" display="block" color="teal.700">
                もっとラク
                <Box as="span" color="gray.950">
                  に。
                </Box>
              </Box>
            </Heading>

            <Text maxW="580px" color="gray.800" textStyle={{ base: "body", md: "lg" }} lineHeight="1.9">
              希望シフトの回収から、シフト表の作成・共有までLINEで完結。
              <Box as="span" display={{ base: "inline", md: "block" }}>
                小さなお店のシフト管理ツール「シフトリ」
              </Box>
            </Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, sm: 2 }} gap={4} w="full" maxW={{ md: "660px" }}>
            <HeroButton icon={LuUserPlus} label="無料ではじめる" subLabel="1分で登録完了" tone="primary" />
            <HeroButton icon={LuMonitorPlay} label="登録なしでデモを見る" tone="secondary" />
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, md: 3 }} gap={{ base: 3, md: 5 }} w="full" maxW="760px">
            {heroBenefits.map((benefit) => (
              <HeroBenefit key={benefit.title} {...benefit} />
            ))}
          </SimpleGrid>
        </VStack>

        <HeroVisual />
      </Grid>
    </Container>
  </Box>
);

const Brand = () => (
  <Flex align="center" gap={3}>
    <Image src="/logo192.webp" alt="シフトリ" boxSize={{ base: 9, md: 10 }} objectFit="contain" />
    <Text color="gray.950" fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold">
      シフトリ
    </Text>
  </Flex>
);

const HeroButton = ({
  icon,
  label,
  subLabel,
  tone,
}: {
  icon: IconType;
  label: string;
  subLabel?: string;
  tone: "primary" | "secondary";
}) => {
  const isPrimary = tone === "primary";

  return (
    <Button
      type="button"
      h={{ base: "56px", md: "64px" }}
      justifyContent="space-between"
      px={{ base: 5, md: 6 }}
      colorPalette="teal"
      variant={isPrimary ? "solid" : "outline"}
      bg={isPrimary ? undefined : "white"}
      borderRadius="full"
      fontWeight="bold"
      whiteSpace="normal"
    >
      <Flex align="center" gap={3}>
        <Icon as={icon} boxSize={{ base: 5, md: 6 }} />
        <Text as="span" fontSize={{ base: "md", md: "lg" }}>
          {label}
          {subLabel ? (
            <Box as="span" ml={2} fontSize={{ base: "xs", md: "sm" }}>
              （{subLabel}）
            </Box>
          ) : null}
        </Text>
      </Flex>
      <Icon as={LuChevronRight} boxSize={5} />
    </Button>
  );
};

const HeroBenefit = ({ icon, title, body }: { icon: IconType; title: string; body: string }) => (
  <Flex
    align="center"
    gap={4}
    bg={{ base: "white", md: "transparent" }}
    borderWidth={{ base: "1px", md: "0" }}
    borderColor="blackAlpha.100"
    borderRadius="2xl"
    p={{ base: 3, md: 0 }}
  >
    <Flex
      align="center"
      justify="center"
      flex="0 0 auto"
      boxSize={{ base: 11, md: 14 }}
      bg="teal.50"
      color="teal.700"
      borderRadius="full"
      borderWidth="1px"
      borderColor="teal.100"
    >
      <Icon as={icon} boxSize={{ base: 6, md: 7 }} />
    </Flex>
    <Box>
      <Text color="teal.800" textStyle={{ base: "sm", md: "md" }} fontWeight="bold" lineHeight="1.5">
        {title}
      </Text>
      <Text mt={1} color="gray.700" textStyle="xs" fontWeight="bold" lineHeight="1.5">
        {body}
      </Text>
    </Box>
  </Flex>
);

const HeroVisual = () => (
  <>
    <Box display={{ base: "block", lg: "none" }} maxW="360px" mx="auto" mt={{ base: 2, md: 0 }}>
      <Image src={heroSpImage} alt="シフトリのスマホ通知イメージ" w="full" h="auto" objectFit="contain" />
    </Box>

    <Box display={{ base: "none", lg: "block" }} position="relative" minH="520px">
      <DashboardMock />
      <PhoneMock />
    </Box>
  </>
);

const DashboardMock = () => (
  <Box position="absolute" left="-10px" right="8%" top="10px">
    <Image src={heroPcImage} alt="シフトリのPCシフト作成画面イメージ" w="full" h="auto" objectFit="contain" />
  </Box>
);

const PhoneMock = () => (
  <Box position="absolute" right="0" bottom="-10px" w="250px">
    <Image src={heroSpImage} alt="シフトリのスマホ通知イメージ" w="full" h="auto" objectFit="contain" />
  </Box>
);

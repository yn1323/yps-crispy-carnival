import {
  Box,
  Container,
  Flex,
  Grid,
  Heading,
  HStack,
  Icon,
  Image,
  Link,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { IconType } from "react-icons";
import {
  LuBell,
  LuCalendarCheck,
  LuChevronRight,
  LuClipboardCheck,
  LuMessageCircle,
  LuMousePointerClick,
  LuSmartphone,
} from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import heroPcImage from "../../LandingPage/hero-pc.webp";
import heroSpImage from "../../LandingPage/hero-sp.webp";

const navItems = [
  { label: "機能", href: "#features" },
  { label: "料金プラン", href: "#pricing" },
  { label: "導入事例", href: "#use-cases" },
  { label: "よくある質問", href: "#faq" },
  { label: "お役立ち記事", href: "#articles" },
];

const heroBenefits: Array<{ icon: IconType; label: string }> = [
  { icon: LuMessageCircle, label: "LINEで希望シフト回収" },
  { icon: LuBell, label: "自動リマインド" },
  { icon: LuMousePointerClick, label: "アプリ不要" },
  { icon: LuSmartphone, label: "スマホでも作成OK" },
  { icon: LuCalendarCheck, label: "確定シフトを自動共有" },
];

export const HeroSection = () => (
  <Box as="section" bg="white" color="gray.950" overflow="hidden">
    <Container maxW="7xl" pt={6} pb={12}>
      <LandingHeader />

      <Grid templateColumns={{ base: "1fr", lg: "0.9fr 1.1fr" }} gap={{ base: 10, xl: 14 }} alignItems="center" pt={14}>
        <VStack align="start" gap={7}>
          <VStack align="start" gap={5}>
            <Flex
              align="center"
              gap={2}
              bg="teal.50"
              color="teal.700"
              borderRadius="full"
              px={4}
              py={2}
              textStyle="sm"
              fontWeight="bold"
            >
              <Icon as={LuClipboardCheck} boxSize={4} />
              小規模店舗向け｜LINEで使える無料のシフト管理
            </Flex>

            <Heading as="h1" fontSize={{ base: "4xl", md: "5xl", xl: "6xl" }} lineHeight="1.18" letterSpacing="0">
              シフトのやり取りを、
              <Box as="span" display="block" color="teal.600">
                LINEとメール
                <Box as="span" color="gray.950">
                  で
                </Box>
              </Box>
              ひとつに。
            </Heading>

            <Text
              maxW="560px"
              color="gray.800"
              fontSize={{ base: "md", md: "lg" }}
              lineHeight="1.9"
              fontWeight="semibold"
            >
              希望シフトを集めて、出していない人に声をかけて、決まったら知らせる。
              毎月くり返すその連絡を、シフトリがまとめて引き受けます。スタッフはアプリ不要、無料で始められます。
            </Text>
          </VStack>

          <HStack gap={4} flexWrap="wrap">
            <HeroButton href="/signup" label="無料で試してみる" tone="primary" />
            <HeroButton href="/demo/flow" label="登録不要でデモを見る" tone="secondary" />
          </HStack>
        </VStack>

        <HeroVisual />
      </Grid>

      <SimpleGrid columns={{ base: 2, md: 5 }} gap={5} mt={10} pt={7} borderTopWidth="1px" borderColor="gray.100">
        {heroBenefits.map((benefit) => (
          <HeroBenefit key={benefit.label} {...benefit} />
        ))}
      </SimpleGrid>
    </Container>
  </Box>
);

const LandingHeader = () => (
  <Flex as="header" align="center" justify="space-between" gap={8}>
    <Link href="/" _hover={{ textDecoration: "none", opacity: 0.82 }} flexShrink={0}>
      <Flex align="center" gap={3}>
        <Image src="/logo192.webp" alt="シフトリ" boxSize={10} objectFit="contain" />
        <Box>
          <Text color="gray.950" fontSize="2xl" fontWeight="black" lineHeight="1" letterSpacing="0">
            シフトリ
          </Text>
          <Text mt={1} color="gray.700" fontSize="2xs" fontWeight="bold" lineHeight="1">
            LINEで使えるシフト管理
          </Text>
        </Box>
      </Flex>
    </Link>

    <HStack as="nav" gap={{ md: 5, xl: 8 }} hideBelow="lg">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          color="gray.900"
          fontSize="sm"
          fontWeight="bold"
          _hover={{ color: "teal.700", textDecoration: "none" }}
        >
          {item.label}
        </Link>
      ))}
    </HStack>

    <HStack gap={3} flexShrink={0}>
      <Button asChild variant="outline" colorPalette="teal" h="42px" px={6} borderRadius="md" fontWeight="bold">
        <a href="/login">ログイン</a>
      </Button>
      <Button asChild colorPalette="teal" h="42px" px={6} borderRadius="md" fontWeight="bold" hideBelow="md">
        <a href="/signup">無料で試してみる</a>
      </Button>
    </HStack>
  </Flex>
);

const HeroButton = ({ href, label, tone }: { href: string; label: string; tone: "primary" | "secondary" }) => {
  const isPrimary = tone === "primary";

  return (
    <Button
      asChild
      colorPalette="teal"
      variant={isPrimary ? "solid" : "outline"}
      bg={isPrimary ? undefined : "white"}
      h="64px"
      minW="220px"
      px={8}
      borderRadius="md"
      fontWeight="bold"
      fontSize="md"
    >
      <a href={href}>
        {label}
        <Icon as={LuChevronRight} boxSize={5} />
      </a>
    </Button>
  );
};

const HeroVisual = () => (
  <Box position="relative" minH={{ base: "420px", xl: "520px" }} w="full">
    <Box
      position="absolute"
      insetBlockStart="4%"
      insetInlineStart="8%"
      insetInlineEnd="-18%"
      h="86%"
      bg="#eaf8f6"
      borderRadius="48px 0 0 48px"
    />
    <Box position="absolute" insetInlineStart="0" insetInlineEnd="12%" insetBlockStart="12%">
      <Image
        src={heroPcImage}
        alt="シフトリのPCシフト表画面"
        w="full"
        objectFit="contain"
        filter="drop-shadow(0 24px 32px rgba(15, 23, 42, 0.18))"
      />
    </Box>
    <Box position="absolute" insetInlineEnd="0" insetBlockEnd="1%" w={{ base: "31%", xl: "30%" }} minW="190px">
      <Image
        src={heroSpImage}
        alt="スマホで希望シフトを提出する画面"
        w="full"
        objectFit="contain"
        filter="drop-shadow(0 22px 30px rgba(15, 23, 42, 0.22))"
      />
    </Box>
  </Box>
);

const HeroBenefit = ({ icon, label }: { icon: IconType; label: string }) => (
  <Flex align="center" justify="center" gap={3} minH="48px" color="gray.800">
    <Icon as={icon} boxSize={6} color="teal.600" />
    <Text fontSize="sm" fontWeight="bold" lineHeight="1.5">
      {label}
    </Text>
  </Flex>
);

import { Box, Container, Flex, Grid, Heading, Icon, Image, SimpleGrid, Stack, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import {
  LuBell,
  LuCalendarCheck,
  LuChevronRight,
  LuClipboardCheck,
  LuMail,
  LuMousePointerClick,
  LuSmartphone,
} from "react-icons/lu";
import { SiLine } from "react-icons/si";
import { Button } from "@/src/components/ui/Button";
import heroPcImage from "../hero-pc.webp";
import heroSpImage from "../hero-sp.webp";

const heroBenefits: Array<{ icon: IconType; label: string }> = [
  { icon: SiLine, label: "LINEで希望シフト回収" },
  { icon: LuBell, label: "自動リマインド" },
  { icon: LuMousePointerClick, label: "アプリ不要" },
  { icon: LuSmartphone, label: "スマホでシフト作成" },
  { icon: LuCalendarCheck, label: "シフトを自動共有" },
  { icon: LuMail, label: "メールでもOK" },
];

export const HeroSection = () => (
  <Box as="section" bg="white" color="gray.950" overflow="hidden">
    <Container maxW="7xl" pt={{ base: 2, md: 6 }} pb={{ base: 8, md: 12 }}>
      <Grid
        templateColumns={{ base: "1fr", lg: "0.9fr 1.1fr" }}
        gap={{ base: 7, xl: 14 }}
        alignItems="center"
        pt={{ base: 6, lg: 8 }}
      >
        <VStack
          align={{ base: "center", lg: "start" }}
          gap={{ base: 5, md: 7 }}
          textAlign={{ base: "center", lg: "start" }}
        >
          <VStack align={{ base: "center", lg: "start" }} gap={{ base: 4, md: 5 }}>
            <Flex
              align="center"
              gap={2}
              bg="teal.50"
              color="teal.700"
              borderRadius="full"
              px={{ base: 3, md: 4 }}
              py={2}
              textStyle={{ base: "xs", md: "sm" }}
              fontWeight="bold"
            >
              <Icon as={LuClipboardCheck} boxSize={4} flexShrink={0} />
              LINEで使える無料のシフト管理
            </Flex>

            <Heading
              as="h1"
              fontSize={{ base: "3xl", sm: "2xl", md: "3xl", xl: "4xl" }}
              lineHeight={{ base: "1.3", md: "1.18" }}
              letterSpacing="0"
            >
              シフトのやり取りを
              <Box as="span" display="block" color="teal.600">
                LINEやメール
                <Box as="span" color="gray.950">
                  でひとつに
                </Box>
              </Box>
            </Heading>

            <Text
              maxW="560px"
              color="gray.800"
              fontSize={{ base: "md", md: "lg" }}
              lineHeight="1.9"
              fontWeight="semibold"
            >
              シフトの回収、催促、調整、決まったら共有
              <br />
              毎月くり返すやりとりをシフトリがまとめて担当
              <br />
              スタッフはアプリ不要、無料で始められます
            </Text>
          </VStack>

          <Stack
            direction={{ base: "column", md: "row" }}
            align={{ base: "stretch", md: "center", lg: "flex-start" }}
            justify={{ base: "center", lg: "flex-start" }}
            gap={4}
            w={{ base: "full", md: "auto" }}
          >
            <HeroButton href="/signup" label="無料で試してみる" tone="primary" />
            <HeroButton href="/demo/flow" label="登録不要でデモを見る" tone="secondary" />
          </Stack>
        </VStack>

        <HeroVisual />
      </Grid>

      <SimpleGrid
        columns={{ base: 2, md: 3, lg: 6 }}
        gap={{ base: 3, md: 4, lg: 5 }}
        mt={10}
        pt={7}
        borderTopWidth="1px"
        borderColor="gray.100"
      >
        {heroBenefits.map((benefit, index) => (
          <HeroBenefit
            key={benefit.label}
            spanOnSm={heroBenefits.length % 2 === 1 && index === heroBenefits.length - 1}
            {...benefit}
          />
        ))}
      </SimpleGrid>
    </Container>
  </Box>
);

const HeroButton = ({ href, label, tone }: { href: string; label: string; tone: "primary" | "secondary" }) => {
  const isPrimary = tone === "primary";

  return (
    <Button
      asChild
      colorPalette="teal"
      variant={isPrimary ? "solid" : "outline"}
      bg={isPrimary ? undefined : "white"}
      h={{ base: "56px", md: "64px" }}
      minW="220px"
      w={{ base: "full", md: "auto" }}
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
  <Box
    position="relative"
    w="full"
    maxW={{ base: "640px", md: "760px", lg: "none" }}
    minH={{ base: "360px", md: "500px", lg: "420px", xl: "520px" }}
    mx={{ base: "auto", lg: 0 }}
  >
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

const HeroBenefit = ({ icon, label, spanOnSm }: { icon: IconType; label: string; spanOnSm: boolean }) => (
  <Flex
    align="center"
    justify={{ base: "flex-start", md: "center" }}
    gap={3}
    minH={{ base: "32px", md: "48px" }}
    w="full"
    px={{ base: 2, sm: 5, md: 0 }}
    color="gray.800"
    gridColumn={{ sm: spanOnSm ? "1 / -1" : "auto", md: "auto" }}
  >
    <Icon as={icon} boxSize={6} color="teal.600" flexShrink={0} />
    <Text fontSize="sm" fontWeight="bold" lineHeight="1.5">
      {label}
    </Text>
  </Flex>
);

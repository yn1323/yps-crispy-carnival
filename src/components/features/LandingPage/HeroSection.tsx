import { Box, Container, Flex, Grid, Heading, Icon, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import type { IconType } from "react-icons";
import { LuBell, LuCalendarDays, LuChevronRight, LuMonitorPlay, LuUserPlus } from "react-icons/lu";
import { Header } from "@/src/components/templates/Header";
import { Button, type ButtonProps } from "@/src/components/ui/Button";
import heroPcImage from "./hero-pc.webp";
import heroSpImage from "./hero-sp.webp";

const heroBenefits = [
  {
    imageSrc: "/line-icon.png",
    title: "LINEで提出",
    body: "専用アプリ不要",
  },
  {
    icon: LuCalendarDays,
    title: "簡単作成",
    body: "AIサポート",
  },
  {
    icon: LuBell,
    title: "すぐ共有",
    body: "まとめて通知",
    hideOnMobile: true,
  },
];

export const HeroSection = () => (
  <Box
    as="section"
    position="relative"
    overflow="hidden"
    bgGradient="to-b"
    gradientFrom="#E6F7F5"
    gradientVia="#F3FBFA"
    gradientTo="white"
    color="gray.950"
  >
    <Header variant="public" />

    <Container position="relative" zIndex={1} maxW="7xl" pt={{ base: 24, md: 28 }} pb={{ base: 12, md: 16 }}>
      <Grid
        mt={{ base: 0, md: 4 }}
        templateColumns={{ base: "1fr", xl: "minmax(0, 0.88fr) minmax(520px, 1.12fr)" }}
        gap={{ base: 8, md: 9, xl: 10 }}
        alignItems="center"
      >
        <VStack align={{ base: "stretch", xl: "start" }} gap={{ base: 7, md: 8 }}>
          <Grid
            templateColumns={{ base: "1fr", md: "minmax(0, 0.92fr) minmax(320px, 1.08fr)", xl: "1fr" }}
            gap={{ base: 5, md: 7 }}
            alignItems="center"
            w="full"
          >
            <VStack
              align={{ base: "center", md: "start" }}
              gap={{ base: 5, md: 6 }}
              textAlign={{ base: "center", md: "left" }}
            >
              <Heading
                as="h1"
                fontSize={{ base: "3xl", sm: "4xl", md: "5xl", xl: "6xl" }}
                lineHeight={{ base: "2.25rem", sm: "2.75rem", md: "3.75rem", xl: "4.5rem" }}
                letterSpacing="0"
              >
                シフト作成を
                <Box as="span" display="block" color="teal.700">
                  もっとラク
                  <Box as="span" color="gray.950">
                    に
                  </Box>
                </Box>
              </Heading>

              <Text maxW="560px" color="gray.800" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8">
                希望回収からシフト作成・通知まで、LINEでひとつに。
                <Box as="span" display="block">
                  小さなお店向けのシフト管理ツールです。
                </Box>
              </Text>
            </VStack>

            <CompactHeroVisual />
          </Grid>

          <SimpleGrid columns={{ base: 1, sm: 2 }} gap={4} w="full" maxW={{ md: "660px" }}>
            <HeroButton icon={LuUserPlus} label="無料ではじめる" tone="primary" to="/signup" />
            <HeroButton icon={LuMonitorPlay} label="サンプルを見る" tone="secondary" href="/demo/shiftboard" external />
          </SimpleGrid>

          <SimpleGrid display="grid" columns={{ base: 2, md: 3 }} gap={{ base: 3, md: 5 }} w="full" maxW="760px">
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

type HeroButtonProps = {
  icon: IconType;
  label: string;
  tone: "primary" | "secondary";
  to?: "/signup" | "/login";
  href?: string;
  external?: boolean;
} & ButtonProps;

const HeroButton = ({ icon, label, tone, to, href, external, ...buttonProps }: HeroButtonProps) => {
  const isPrimary = tone === "primary";
  const content = (
    <>
      <Icon as={icon} boxSize={{ base: 5, md: 6 }} justifySelf="center" />
      <Text
        as="span"
        minW={0}
        textAlign={{ base: "center", md: "left" }}
        fontSize={{ base: "md", md: "lg" }}
        whiteSpace={{ base: "normal", md: "nowrap" }}
      >
        {label}
      </Text>
      <Icon as={LuChevronRight} boxSize={5} justifySelf="center" />
    </>
  );

  return (
    <Button
      asChild={!!to || !!href}
      type="button"
      display="grid"
      gridTemplateColumns={{ base: "24px minmax(0, 1fr) 24px", md: "auto minmax(0, 1fr) auto" }}
      columnGap={{ base: 3, md: 4 }}
      h={{ base: "56px", md: "64px" }}
      w="full"
      px={{ base: 5, md: 6 }}
      colorPalette="teal"
      variant={isPrimary ? "solid" : "outline"}
      bg={isPrimary ? undefined : "white"}
      borderRadius="full"
      fontWeight="bold"
      whiteSpace="normal"
      {...buttonProps}
    >
      {to ? (
        <RouterLink to={to} search={{ redirect: undefined }}>
          {content}
        </RouterLink>
      ) : href ? (
        <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
          {content}
        </a>
      ) : (
        content
      )}
    </Button>
  );
};

const HeroBenefit = ({
  icon,
  imageSrc,
  title,
  body,
  hideOnMobile,
}: {
  icon?: IconType;
  imageSrc?: string;
  title: string;
  body: string;
  hideOnMobile?: boolean;
}) => (
  <Flex
    display={{ base: hideOnMobile ? "none" : "flex", md: "flex" }}
    align="center"
    gap={{ base: 3, md: 4 }}
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
      bg={imageSrc ? "transparent" : "teal.50"}
      color="teal.700"
      borderRadius={imageSrc ? "none" : "full"}
      borderWidth={imageSrc ? "0" : "1px"}
      borderColor={imageSrc ? "transparent" : "teal.100"}
    >
      {imageSrc ? (
        <Image src={imageSrc} alt="" boxSize={{ base: 9, md: 10 }} objectFit="contain" />
      ) : (
        icon && <Icon as={icon} boxSize={{ base: 6, md: 7 }} />
      )}
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

const CompactHeroVisual = () => (
  <Box
    display={{ base: "block", xl: "none" }}
    position="relative"
    alignSelf="center"
    justifySelf="center"
    w="full"
    maxW={{ base: "320px", md: "400px", lg: "500px" }}
    aspectRatio="1.08"
    mt={{ base: 0, md: 2 }}
  >
    <Box position="absolute" insetStart="0" insetEnd="7%" insetBlockStart="8%">
      <Image
        src={heroPcImage}
        alt="シフトリのPCシフト作成画面イメージ"
        w="full"
        h="auto"
        objectFit="contain"
        filter="drop-shadow(0 14px 22px rgba(12, 36, 48, 0.16))"
      />
    </Box>
    <Box position="absolute" insetEnd="0" insetBlockEnd="0" w="38%">
      <Image
        src={heroSpImage}
        alt="シフトリのスマホ通知イメージ"
        w="full"
        h="auto"
        objectFit="contain"
        filter="drop-shadow(0 14px 24px rgba(12, 36, 48, 0.2))"
      />
    </Box>
  </Box>
);

const HeroVisual = () => (
  <Box display={{ base: "none", xl: "block" }} position="relative" minH="520px">
    <DashboardMock />
    <PhoneMock />
  </Box>
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

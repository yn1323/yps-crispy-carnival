import { Box, Button, Flex, Heading, HStack, Image, Link, SimpleGrid, Stack, Text, VStack } from "@chakra-ui/react";
import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { Link as RouterLink } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { LuCalendarCheck, LuLink, LuSend } from "react-icons/lu";
import {
  PiArrowDown,
  PiArrowRight,
  PiCalculator,
  PiCalendarBlank,
  PiChatsCircle,
  PiNotebook,
  PiPencilSimple,
} from "react-icons/pi";
import { BrowserMockup } from "@/src/components/ui/BrowserMockup";
import { type Faq, faqs } from "./faqs";

export const LandingPage = () => {
  return (
    <Box bg="white" minH="100vh" color="fg">
      <Nav />
      <Hero />
      <ToolsSection />
      <ScreenPreviewSection />
      <PointSection />
      <FaqSection />
      <BottomCta />
      <Footer />
    </Box>
  );
};

type Badge = {
  icon: IconType;
  x: number;
  y: number;
  size: number;
  rot: number;
};

const BADGES_SP: Badge[] = [
  { icon: PiChatsCircle, x: 20, y: 15, size: 54, rot: -12 },
  { icon: PiNotebook, x: 170, y: 3, size: 50, rot: 14 },
  { icon: PiCalculator, x: 10, y: 125, size: 48, rot: 8 },
  { icon: PiCalendarBlank, x: 160, y: 140, size: 52, rot: -10 },
  { icon: PiPencilSimple, x: 93, y: 73, size: 50, rot: -5 },
];

const BADGES_PC: Badge[] = [
  { icon: PiChatsCircle, x: 25, y: 20, size: 60, rot: -12 },
  { icon: PiNotebook, x: 189, y: 5, size: 56, rot: 14 },
  { icon: PiCalculator, x: 15, y: 138, size: 52, rot: 8 },
  { icon: PiCalendarBlank, x: 172, y: 152, size: 58, rot: -10 },
  { icon: PiPencilSimple, x: 102, y: 82, size: 56, rot: -5 },
];

const ToolsSection = () => (
  <Box bg="gray.50" px={{ base: 4, lg: 12 }} py={{ base: 12, lg: 24 }}>
    <VStack mx="auto" w="full" maxW="1024px" gap={{ base: 5, lg: 14 }} align="center">
      <VStack gap={{ base: 2.5, lg: 3 }} align="center">
        <Heading
          as="h2"
          fontWeight="medium"
          fontSize={{ base: "28px", lg: "36px" }}
          lineHeight={1.35}
          textAlign="center"
          color="fg"
          whiteSpace={{ base: "pre-line", lg: "normal" }}
        >
          {"シフト作りの道具\nひとつにしよう"}
        </Heading>
        <Text fontSize={{ base: "15px", lg: "18px" }} color="fg.muted" lineHeight={1.5} textAlign="center">
          LINE Excel メモ ぜんぶここで
        </Text>
      </VStack>
      <Stack direction={{ base: "column", lg: "row" }} align="center" justify="center" gap={{ base: 10, lg: 8 }}>
        <BadgeCluster />
        <Box color="#888780" display={{ base: "block", lg: "none" }}>
          <PiArrowDown size={36} />
        </Box>
        <Box color="#888780" display={{ base: "none", lg: "block" }}>
          <PiArrowRight size={40} />
        </Box>
        <Box
          bg="teal.600"
          borderRadius="8px"
          px={{ base: 3, lg: 4 }}
          py={{ base: 2, lg: 3 }}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Image src="/textlogo.webp" alt="シフトリ" h={{ base: "44px", lg: "64px" }} w="auto" />
        </Box>
      </Stack>
    </VStack>
  </Box>
);

const BadgeCluster = () => (
  <>
    <Box position="relative" w="240px" h="200px" display={{ base: "block", lg: "none" }}>
      {BADGES_SP.map((b) => (
        <BadgeItem key={`sp-${b.icon.name}`} {...b} />
      ))}
    </Box>
    <Box position="relative" w="260px" h="220px" display={{ base: "none", lg: "block" }}>
      {BADGES_PC.map((b) => (
        <BadgeItem key={`pc-${b.icon.name}`} {...b} />
      ))}
    </Box>
  </>
);

const BadgeItem = ({ icon: Icon, x, y, size, rot }: Badge) => (
  <Flex
    position="absolute"
    left={`${x}px`}
    top={`${y}px`}
    boxSize={`${size}px`}
    align="center"
    justify="center"
    bg="#FCEBEB"
    borderRadius="12px"
    color="#D85A30"
    transform={`rotate(${rot}deg)`}
  >
    <Icon size={size * 0.58} />
  </Flex>
);

const ScreenPreviewSection = () => (
  <Box bg="gray.50" px={{ base: 4, lg: 12 }} py={{ base: 12, lg: 24 }}>
    <Flex mx="auto" w="full" maxW="1024px" justify="center">
      <BrowserMockup src="/lp/shiftForm.webp" alt="シフトリの画面サンプル" maxW={{ base: "full", lg: "1000px" }} />
    </Flex>
  </Box>
);

export const Nav = () => (
  <Box as="nav" bgGradient="to-b" gradientFrom="teal.600" gradientTo="#99f6e4" w="full">
    <Flex align="center" justify="space-between" px={{ base: 4, lg: 12 }} py={{ base: 3, lg: 5 }}>
      <Link asChild _hover={{ opacity: 0.8, textDecoration: "none" }}>
        <RouterLink to="/">
          <Image src="/textlogo.webp" alt="シフトリ" h={{ base: "36px", lg: "44px" }} w="auto" loading="eager" />
        </RouterLink>
      </Link>
    </Flex>
  </Box>
);

const Hero = () => (
  <Box bgImage="linear-gradient(180deg, #99f6e4 0%, #fafafa 100%)" px={{ base: 4, lg: 12 }} py={{ base: 16, lg: 28 }}>
    <VStack
      mx="auto"
      w="full"
      maxW={{ base: "full", lg: "768px" }}
      gap={{ base: 5, lg: 7 }}
      align="stretch"
      textAlign="left"
    >
      <Heading
        as="h1"
        fontWeight="bold"
        fontSize={{ base: "26px", lg: "38px" }}
        lineHeight={1.3}
        color="fg"
        whiteSpace="pre-line"
      >
        {"シフト作り\nもっとラクにできる"}
      </Heading>
      <Text fontSize={{ base: "md", lg: "lg" }} color="fg.muted" lineHeight={1.7}>
        少人数のお店のシフト作成 ぜんぶおまかせ
      </Text>
      <Stack
        direction={{ base: "column", lg: "row" }}
        gap={{ base: 3, lg: 4 }}
        w={{ base: "full", lg: "auto" }}
        pt={{ base: 0, lg: 2 }}
        align={{ base: "stretch", lg: "start" }}
      >
        <SignUpButton mode="modal">
          <Button
            colorPalette="teal"
            h="56px"
            w={{ base: "full", lg: "auto" }}
            px={{ base: 0, lg: 8 }}
            fontSize="lg"
            fontWeight="bold"
          >
            ためしてみる
          </Button>
        </SignUpButton>
        <SignInButton mode="modal">
          <Button
            variant="outline"
            colorPalette="teal"
            h={{ base: "48px", lg: "56px" }}
            w={{ base: "full", lg: "auto" }}
            px={{ base: 0, lg: 5 }}
            fontSize="md"
            fontWeight="semibold"
            bg="white"
            _hover={{ bg: "gray.100" }}
          >
            ログイン
          </Button>
        </SignInButton>
      </Stack>
    </VStack>
  </Box>
);

type Point = {
  icon: IconType;
  title: string;
  body: string;
};

const points: Point[] = [
  {
    icon: LuSend,
    title: "募集も確定も ワンクリック",
    body: "期間を決めて一斉送信 確定もボタンひとつで全員に届く",
  },
  {
    icon: LuLink,
    title: "スタッフの登録は不要",
    body: "アプリもアカウントもいらない リンクを開くだけで希望シフトを提出",
  },
  {
    icon: LuCalendarCheck,
    title: "希望はそのままシフト表に",
    body: "希望シフトがそのままシフト表に あとは微調整するだけ",
  },
];

const PointSection = () => (
  <Box bg="gray.50" px={{ base: 4, lg: 12 }} py={{ base: 12, lg: 24 }}>
    <SimpleGrid mx="auto" w="full" maxW="1024px" columns={{ base: 1, lg: 3 }} gap={6}>
      {points.map((p) => (
        <PointCard key={p.title} {...p} />
      ))}
    </SimpleGrid>
  </Box>
);

const PointCard = ({ icon: Icon, title, body }: Point) => (
  <VStack
    align="start"
    bg="white"
    borderWidth="1px"
    borderColor="teal.500"
    borderRadius={{ base: "12px", lg: "16px" }}
    p={{ base: 5, lg: 7 }}
    gap={{ base: 3, lg: 4 }}
    h="full"
  >
    <Flex
      align="center"
      justify="center"
      boxSize={{ base: "56px", lg: "64px" }}
      bg="teal.500"
      borderRadius="full"
      color="white"
    >
      <Icon size={32} />
    </Flex>
    <Text fontWeight="bold" fontSize={{ base: "18px", lg: "20px" }} lineHeight={1.4} color="fg">
      {title}
    </Text>
    <Text fontSize="md" color="fg.muted" lineHeight={1.7}>
      {body}
    </Text>
  </VStack>
);

const FaqSection = () => (
  <Box bg="gray.50" px={{ base: 4, lg: 12 }} py={{ base: 12, lg: 24 }}>
    <VStack mx="auto" w="full" maxW="768px" gap={{ base: 6, lg: 8 }} align="stretch">
      <Heading as="h2" fontWeight="bold" fontSize={{ base: "24px", lg: "28px" }} lineHeight={1.3} color="teal.700">
        よくある質問
      </Heading>
      <VStack gap={{ base: 3, lg: 4 }} align="stretch">
        {faqs.map((f) => (
          <FaqItem key={f.q} {...f} />
        ))}
      </VStack>
    </VStack>
  </Box>
);

const FaqItem = ({ q, a }: Faq) => (
  <VStack
    align="start"
    bg="white"
    borderLeftWidth="3px"
    borderLeftColor="teal.500"
    borderRadius="12px"
    p={{ base: 5, lg: 7 }}
    gap={{ base: 2, lg: 3 }}
  >
    <Text fontWeight="bold" fontSize={{ base: "16px", lg: "18px" }} lineHeight={1.6} color="fg">
      {q}
    </Text>
    <Text fontSize={{ base: "15px", lg: "16px" }} color="fg.muted" lineHeight={1.7}>
      {a}
    </Text>
  </VStack>
);

const BottomCta = () => (
  <Box bgImage="linear-gradient(180deg, #f0fdfa 0%, #ffffff 100%)" px={{ base: 4, lg: 12 }} py={{ base: 12, lg: 24 }}>
    <VStack mx="auto" w="full" maxW="768px" gap={6} align="center" textAlign="center">
      <Heading as="h2" fontWeight="bold" fontSize={{ base: "20px", lg: "24px" }} color="fg">
        シフト作り もっとラクにできる
      </Heading>
      <Text fontSize={{ base: "15px", lg: "16px" }} color="fg.muted">
        少人数のお店のシフト管理を もっとかんたんに
      </Text>
      <SignUpButton mode="modal">
        <Button
          colorPalette="teal"
          h="56px"
          px={8}
          fontSize="lg"
          fontWeight="bold"
          w={{ base: "full", lg: "auto" }}
          minW={{ lg: "240px" }}
        >
          ためしてみる
        </Button>
      </SignUpButton>
    </VStack>
  </Box>
);

export const Footer = () => (
  <Box as="footer" bg="teal.600" px={{ base: 4, lg: 12 }} py={{ base: 8, lg: 12 }}>
    <VStack mx="auto" w="full" maxW="1024px" gap={4} align="center">
      <Image src="/textlogo.webp" alt="シフトリ" h={{ base: "40px", lg: "48px" }} w="auto" />
      <HStack gap={{ base: 6, lg: 8 }}>
        <FooterLink to="/privacy">プライバシーポリシー</FooterLink>
        <FooterLink to="/terms">利用規約</FooterLink>
      </HStack>
      <Text fontSize="xs" color="whiteAlpha.700">
        © {new Date().getFullYear()} シフトリ v{__APP_VERSION__}
      </Text>
    </VStack>
  </Box>
);

const FooterLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link
    asChild
    fontSize="sm"
    fontWeight="medium"
    color="whiteAlpha.800"
    _hover={{ color: "white", textDecoration: "none" }}
  >
    <RouterLink to={to}>{children}</RouterLink>
  </Link>
);

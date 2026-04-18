import { Box, Button, Flex, Heading, HStack, Image, Link, SimpleGrid, Stack, Text, VStack } from "@chakra-ui/react";
import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { Link as RouterLink } from "@tanstack/react-router";
import { useState } from "react";
import type { IconType } from "react-icons";
import { LuCalendarCheck, LuCheck, LuSend } from "react-icons/lu";
import { PiArrowRight, PiChatsCircle, PiClock, PiEnvelopeSimple, PiNote, PiNotebook, PiTable } from "react-icons/pi";
import { type Faq, faqs } from "./faqs";

const ANIMATIONS = `
@keyframes lp2-bar-in {
  from { opacity: 0; transform: translateX(-8px) scaleX(0.8); transform-origin: left; }
  to { opacity: 1; transform: translateX(0) scaleX(1); }
}
@keyframes lp2-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: 0.6; }
}
@keyframes lp2-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
`;

export const LandingPage = () => (
  <Box bg="white" minH="100vh" color="fg">
    <style>{ANIMATIONS}</style>
    <Nav />
    <Hero />
    <PointsSection />
    <ToolsSection />
    <HowSection />
    <FaqSection />
    <BottomCta />
    <Footer />
  </Box>
);

const Eyebrow = ({ children }: { children: string }) => (
  <HStack
    display="inline-flex"
    gap={2}
    fontSize="13px"
    fontWeight="semibold"
    color="teal.700"
    bg="teal.50"
    px="14px"
    py="6px"
    borderRadius="full"
    letterSpacing="0.04em"
  >
    <Box boxSize="6px" borderRadius="full" bg="teal.600" />
    <Box as="span">{children}</Box>
  </HStack>
);

const SectionHeading = ({ children }: { children: string }) => (
  <Heading
    as="h2"
    mt={5}
    fontWeight="medium"
    fontSize={{ base: "30px", lg: "48px" }}
    lineHeight={1.3}
    letterSpacing="-0.01em"
    whiteSpace="pre-line"
    textAlign="center"
  >
    {children}
  </Heading>
);

const SectionSub = ({ children }: { children: string }) => (
  <Text mt={4} fontSize="17px" color="fg.muted" lineHeight={1.75} textAlign="center">
    {children}
  </Text>
);

export const Nav = () => (
  <Box
    as="nav"
    position="sticky"
    top={0}
    zIndex={40}
    h="56px"
    bgGradient="to-b"
    gradientFrom="teal.600"
    gradientTo="#99f6e4"
    color="white"
    px={{ base: 4, lg: 6 }}
    display="flex"
    alignItems="center"
  >
    <Flex w="full" maxW="1024px" mx="auto" align="center" justify="space-between" gap={4}>
      <Link asChild _hover={{ opacity: 0.8, textDecoration: "none" }}>
        <RouterLink to="/">
          <HStack gap={2.5} fontWeight="bold" fontSize="18px" letterSpacing="0.02em" color="white">
            <Flex
              boxSize="28px"
              borderRadius="full"
              bg="whiteAlpha.300"
              align="center"
              justify="center"
              overflow="hidden"
            >
              <Image src="/logo512.png" alt="" boxSize="22px" />
            </Flex>
            <Box as="span">シフトリ</Box>
          </HStack>
        </RouterLink>
      </Link>
      <HStack as="nav" gap={6} fontSize="14px" display={{ base: "none", md: "flex" }}>
        <Link href="/#features" color="white" opacity={0.9} _hover={{ opacity: 0.7, textDecoration: "none" }}>
          できること
        </Link>
        <Link href="/#how" color="white" opacity={0.9} _hover={{ opacity: 0.7, textDecoration: "none" }}>
          使い方
        </Link>
        <Link href="/#faq" color="white" opacity={0.9} _hover={{ opacity: 0.7, textDecoration: "none" }}>
          よくある質問
        </Link>
      </HStack>
      <Link
        href="/#cta"
        bg="white"
        color="teal.700"
        px="18px"
        py="8px"
        borderRadius="full"
        fontWeight="bold"
        fontSize="14px"
        _hover={{ opacity: 0.85, textDecoration: "none" }}
      >
        ためしてみる
      </Link>
    </Flex>
  </Box>
);

const Hero = () => (
  <Box
    position="relative"
    overflow="hidden"
    bgGradient="to-b"
    gradientFrom="#99f6e4"
    gradientTo="#fafafa"
    px={{ base: 5, lg: 6 }}
    pt={{ base: 10, lg: 18 }}
    pb={{ base: 14, lg: 24 }}
  >
    <SimpleGrid
      mx="auto"
      w="full"
      maxW="1024px"
      columns={{ base: 1, lg: 2 }}
      gap={{ base: 10, lg: 16 }}
      alignItems="center"
    >
      <VStack align="stretch" gap={0}>
        <HStack
          alignSelf="start"
          gap={2}
          fontSize="13px"
          fontWeight="semibold"
          color="teal.700"
          bg="white"
          px={4}
          py={2}
          borderRadius="full"
          borderWidth="1px"
          borderColor="teal.200"
          mb={7}
        >
          <Box
            boxSize="6px"
            borderRadius="full"
            bg="teal.500"
            style={{ animation: "lp2-pulse 2s ease-in-out infinite" }}
          />
          <Box as="span">少人数のお店のために</Box>
        </HStack>
        <Heading
          as="h1"
          fontSize={{ base: "40px", lg: "64px" }}
          fontWeight="bold"
          lineHeight={1.15}
          letterSpacing="-0.02em"
          whiteSpace="pre-line"
          color="gray.900"
        >
          {"シフト作り\nもっと"}
          <Box as="em" display="inline-block" position="relative" fontStyle="normal" color="teal.600" zIndex={1}>
            ラクに
            <Box
              position="absolute"
              left={0}
              right={0}
              bottom="-2px"
              h={{ base: "8px", lg: "10px" }}
              bg="teal.200"
              borderRadius="4px"
              zIndex={-1}
            />
          </Box>
          できる
        </Heading>
        <Text mt={7} fontSize={{ base: "16px", lg: "20px" }} color="gray.700" lineHeight={1.7} whiteSpace="pre-line">
          少人数のお店のシフト作成 ぜんぶおまかせ
        </Text>
        <Stack
          direction={{ base: "column", sm: "row" }}
          mt={10}
          gap={4}
          align={{ base: "stretch", sm: "center" }}
          flexWrap="wrap"
        >
          <SignUpButton mode="modal">
            <Button colorPalette="teal" h="56px" px={8} fontSize="18px" fontWeight="bold" borderRadius="full">
              ためしてみる <PiArrowRight />
            </Button>
          </SignUpButton>
          <SignInButton mode="modal">
            <Button
              variant="outline"
              colorPalette="teal"
              h="56px"
              px={8}
              fontSize="18px"
              fontWeight="bold"
              borderRadius="full"
              bg="white"
            >
              ログイン
            </Button>
          </SignInButton>
        </Stack>
        <HStack mt={7} gap={6} fontSize="13px" color="fg.muted" flexWrap="wrap">
          <HeroMeta>登録30秒</HeroMeta>
          <HeroMeta>アプリ不要</HeroMeta>
          <HeroMeta>いま無料</HeroMeta>
        </HStack>
      </VStack>
      <ScheduleCanvas />
    </SimpleGrid>
  </Box>
);

const HeroMeta = ({ children }: { children: string }) => (
  <HStack gap={1.5}>
    <Box as="span" color="teal.600" fontWeight="bold">
      ✓
    </Box>
    <Box as="span">{children}</Box>
  </HStack>
);

type ShiftRow = { name: string; bars: { start: number; width: number }[] };

const SHIFT_DATA: ShiftRow[] = [
  { name: "山本 太郎", bars: [{ start: 10, width: 42 }] },
  { name: "田中 拓也", bars: [{ start: 22, width: 46 }] },
  {
    name: "佐藤 美咲",
    bars: [
      { start: 6, width: 28 },
      { start: 52, width: 28 },
    ],
  },
  { name: "鈴木 健太", bars: [{ start: 40, width: 38 }] },
  { name: "山本 優子", bars: [{ start: 56, width: 32 }] },
  { name: "吉田 大輔", bars: [{ start: 14, width: 34 }] },
];

const TIMES = ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];

const ScheduleCanvas = () => (
  <Box
    position="relative"
    bg="white"
    borderWidth="1px"
    borderColor="gray.200"
    borderRadius="16px"
    p={5}
    boxShadow="0 20px 50px -20px rgba(13,148,136,0.25), 0 8px 16px -8px rgba(0,0,0,0.08)"
    overflow="visible"
  >
    <Flex align="center" justify="space-between" mb={4}>
      <HStack gap="5px">
        <Box boxSize="10px" borderRadius="full" bg="#f87171" />
        <Box boxSize="10px" borderRadius="full" bg="#fbbf24" />
        <Box boxSize="10px" borderRadius="full" bg="#4ade80" />
      </HStack>
      <Text fontSize="13px" fontWeight="bold" color="fg.muted" letterSpacing="0.04em" textTransform="uppercase">
        5/2 (土) · 6人
      </Text>
    </Flex>
    <Box position="relative">
      <Box display="grid" gridTemplateColumns="70px repeat(7, 1fr)" fontSize="11px" color="fg.muted" mb={2} pl={1}>
        <Box />
        {TIMES.map((t) => (
          <Box key={t} px={1}>
            {t}
          </Box>
        ))}
      </Box>
      {SHIFT_DATA.map((row, i) => (
        <Box
          key={row.name}
          display="grid"
          gridTemplateColumns="70px 1fr"
          alignItems="center"
          h="36px"
          borderBottomWidth="1px"
          borderColor="gray.100"
          _last={{ borderBottomWidth: 0 }}
        >
          <Text fontSize="12px" color="fg" fontWeight="medium" pr={2} lineClamp={1}>
            {row.name}
          </Text>
          <Box
            position="relative"
            h="24px"
            bgImage="repeating-linear-gradient(90deg, var(--chakra-colors-gray-50), var(--chakra-colors-gray-50) calc(100%/7 - 1px), var(--chakra-colors-gray-200) calc(100%/7 - 1px), var(--chakra-colors-gray-200) calc(100%/7))"
            borderRadius="4px"
            overflow="hidden"
          >
            {row.bars.map((b, j) => (
              <Box
                key={`${row.name}-${b.start}`}
                position="absolute"
                top="3px"
                bottom="3px"
                left={`${b.start}%`}
                w={`${b.width}%`}
                bg="teal.500"
                borderRadius="4px"
                opacity={0}
                style={{
                  animation: "lp2-bar-in 600ms cubic-bezier(0.2,0.8,0.2,1) forwards",
                  animationDelay: `${200 + i * 120 + j * 60}ms`,
                }}
              />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
    <FloatingTag top="-12px" right="20%" delay={0} color="teal.700" showDot>
      確定済み
    </FloatingTag>
    <FloatingTag bottom="30%" left={{ base: "10px", lg: "-40px" }} delay={1} color="gray.700">
      提出 7/7人
    </FloatingTag>
    <FloatingTag top="30%" right={{ base: "10px", lg: "-24px" }} delay={2} color="teal.700" showDot>
      ワンクリックで通知
    </FloatingTag>
  </Box>
);

type FloatingTagProps = {
  children: string;
  top?: string;
  bottom?: string;
  left?: string | { base: string; lg: string };
  right?: string | { base: string; lg: string };
  delay: number;
  color: string;
  showDot?: boolean;
};

const FloatingTag = ({ children, top, bottom, left, right, delay, color, showDot }: FloatingTagProps) => (
  <HStack
    position="absolute"
    top={top}
    bottom={bottom}
    left={left}
    right={right}
    gap={1.5}
    bg="white"
    borderRadius="full"
    px={3}
    py={1.5}
    fontSize="12px"
    fontWeight="semibold"
    color={color}
    borderWidth="1px"
    borderColor="teal.100"
    boxShadow="0 6px 16px rgba(13,148,136,0.2)"
    style={{ animation: `lp2-float 4s ease-in-out infinite`, animationDelay: `${delay}s` }}
  >
    {showDot && <Box boxSize="6px" borderRadius="full" bg="teal.500" />}
    <Box as="span">{children}</Box>
  </HStack>
);

type Point = { num: string; icon: IconType; title: string; lead: string; body: string };

const POINTS: Point[] = [
  {
    num: "01",
    icon: LuSend,
    title: "募集は ワンクリック",
    lead: "期間を決めて一斉送信",
    body: "スタッフは受け取ったリンクを開くだけ\n登録もアプリのインストールもいらない",
  },
  {
    num: "02",
    icon: LuCalendarCheck,
    title: "スマホで提出",
    lead: "時間帯も選ぶだけ",
    body: "外出先でもスキマ時間で終わる\nスタッフにやさしい提出フォーム",
  },
  {
    num: "03",
    icon: LuCheck,
    title: "確定も ワンクリック",
    lead: "集まった希望を見ながら調整",
    body: "調整シフトがボタンで\nひとつで全員に届く",
  },
];

const PointsSection = () => (
  <Box as="section" id="features" px={{ base: 5, lg: 6 }} py={{ base: 12, lg: 24 }}>
    <Box mx="auto" w="full" maxW="1024px">
      <VStack maxW="720px" mx="auto" gap={0} textAlign="center">
        <Eyebrow>できること</Eyebrow>
        <SectionHeading>{"小さなお店のシフトづくり\nぜんぶ ここで"}</SectionHeading>
        <SectionSub>募集から確定まで ワンクリックで進む シンプルな流れ</SectionSub>
      </VStack>
      <SimpleGrid columns={{ base: 1, lg: 3 }} gap={{ base: 4, lg: 6 }} mt={{ base: 10, lg: 14 }}>
        {POINTS.map((p) => (
          <PointCard key={p.num} {...p} />
        ))}
      </SimpleGrid>
    </Box>
  </Box>
);

const PointCard = ({ num, icon: Icon, title, lead, body }: Point) => (
  <Box
    position="relative"
    bg="white"
    borderWidth="1px"
    borderColor="teal.500"
    borderRadius="16px"
    px={7}
    py={8}
    transition="transform 200ms ease, box-shadow 200ms ease"
    _hover={{ transform: "translateY(-4px)", boxShadow: "0 16px 32px -16px rgba(13,148,136,0.3)" }}
  >
    <Text
      position="absolute"
      top={6}
      right={6}
      fontSize="11px"
      fontWeight="bold"
      color="teal.600"
      opacity={0.5}
      letterSpacing="0.1em"
    >
      {num}
    </Text>
    <Flex boxSize="64px" borderRadius="full" bg="teal.50" color="teal.600" align="center" justify="center" mb={6}>
      <Icon size={28} />
    </Flex>
    <Text fontSize="22px" fontWeight="bold" lineHeight={1.4} mb={3}>
      {title}
    </Text>
    <Text fontSize="15px" fontWeight="semibold" color="fg" lineHeight={1.6} mb={2}>
      {lead}
    </Text>
    <Text fontSize="14px" color="fg.muted" lineHeight={1.8} whiteSpace="pre-line">
      {body}
    </Text>
  </Box>
);

type Tool = { icon: IconType; name: string; meta: string; iconBg: string; iconColor: string };

const TOOLS: Tool[] = [
  { icon: PiChatsCircle, name: "LINE", meta: "グループ連絡", iconBg: "#06c755", iconColor: "#fff" },
  { icon: PiTable, name: "Excel", meta: "シフト表", iconBg: "#217346", iconColor: "#fff" },
  { icon: PiNote, name: "付箋メモ", meta: "厨房の壁", iconBg: "#fef3c7", iconColor: "#b45309" },
  { icon: PiNotebook, name: "手書きノート", meta: "バックヤード", iconBg: "#dbeafe", iconColor: "#1e40af" },
  { icon: PiEnvelopeSimple, name: "SMS/メール", meta: "シフト催促", iconBg: "#fce7f3", iconColor: "#be185d" },
  { icon: PiClock, name: "頭の中", meta: "記憶だより", iconBg: "#f4f4f5", iconColor: "#3f3f46" },
];

const ToolsSection = () => (
  <Box
    as="section"
    position="relative"
    overflow="hidden"
    bgGradient="to-b"
    gradientFrom="white"
    gradientVia="teal.50"
    gradientTo="white"
    px={{ base: 5, lg: 6 }}
    py={{ base: 20, lg: 30 }}
  >
    <VStack maxW="720px" mx="auto" gap={0} textAlign="center" mb={{ base: 10, lg: 16 }}>
      <Eyebrow>ツールの統合</Eyebrow>
      <SectionHeading>{"シフト作りの道具\nひとつにしよう"}</SectionHeading>
      <SectionSub>LINE Excel メモ ぜんぶここで</SectionSub>
    </VStack>
    <Box
      mx="auto"
      maxW="920px"
      display="grid"
      gridTemplateColumns={{ base: "1fr", lg: "1fr auto 1fr" }}
      gap={{ base: 6, lg: 10 }}
      alignItems="center"
    >
      <SimpleGrid columns={2} gap={3}>
        {TOOLS.map((t) => (
          <ToolChip key={t.name} {...t} />
        ))}
      </SimpleGrid>
      <Flex
        boxSize="60px"
        borderRadius="full"
        bg="teal.600"
        color="white"
        align="center"
        justify="center"
        mx="auto"
        transform={{ base: "rotate(90deg)", lg: "none" }}
      >
        <PiArrowRight size={28} />
      </Flex>
      <VStack bg="teal.600" borderRadius="20px" p={8} color="white" textAlign="center" gap={3}>
        <Image src="/logo512.png" alt="" boxSize="48px" />
        <Text fontSize="22px" fontWeight="bold">
          シフトリ
        </Text>
        <Text fontSize="13px" opacity={0.85}>
          ひとつの画面で 全部の情報が集まる
        </Text>
      </VStack>
    </Box>
  </Box>
);

const ToolChip = ({ icon: Icon, name, meta, iconBg, iconColor }: Tool) => (
  <HStack
    bg="white"
    borderWidth="1px"
    borderColor="gray.200"
    borderRadius="14px"
    px={{ base: 3, lg: 4 }}
    py={{ base: 2.5, lg: 3.5 }}
    gap={3}
    boxShadow="0 12px 24px -12px rgba(0,0,0,0.15)"
  >
    <Flex
      boxSize={{ base: "28px", lg: "36px" }}
      borderRadius="10px"
      bg={iconBg}
      color={iconColor}
      align="center"
      justify="center"
      flexShrink={0}
    >
      <Icon size={18} />
    </Flex>
    <Box>
      <Text fontSize={{ base: "12px", lg: "14px" }} fontWeight="bold">
        {name}
      </Text>
      <Text fontSize="11px" color="fg.muted" mt="2px" display={{ base: "none", lg: "block" }}>
        {meta}
      </Text>
    </Box>
  </HStack>
);

const STEPS: { title: string; body: string }[] = [
  { title: "募集期間を決める", body: "期間を決めて スタッフ全員にリンクを配る" },
  { title: "希望シフトを集める", body: "スタッフが希望を入力" },
  { title: "確定シフトを通知", body: "調整結果をボタンひとつで全員に反映" },
];

const HowSection = () => (
  <Box as="section" id="how" bg="gray.50" px={{ base: 5, lg: 6 }} py={{ base: 12, lg: 24 }}>
    <Box mx="auto" w="full" maxW="1024px">
      <VStack maxW="720px" mx="auto" gap={0} textAlign="center">
        <Eyebrow>3ステップ</Eyebrow>
        <SectionHeading>使い方は かんたん</SectionHeading>
      </VStack>
      <Box
        mt={{ base: 10, lg: 14 }}
        display="grid"
        gridTemplateColumns={{ base: "1fr", lg: "repeat(3, 1fr)" }}
        position="relative"
      >
        {STEPS.map((s, i) => (
          <StepItem key={s.title} index={i} total={STEPS.length} {...s} />
        ))}
      </Box>
    </Box>
  </Box>
);

const StepItem = ({ index, total, title, body }: { index: number; total: number; title: string; body: string }) => (
  <Box textAlign="center" px={5} position="relative">
    <Flex
      boxSize="48px"
      borderRadius="full"
      bg="white"
      borderWidth="2px"
      borderColor="teal.600"
      color="teal.700"
      align="center"
      justify="center"
      mx="auto"
      mb={5}
      fontWeight="bold"
      fontSize="18px"
      position="relative"
      zIndex={2}
    >
      {index + 1}
    </Flex>
    {index < total - 1 && (
      <Box
        display={{ base: "none", lg: "block" }}
        position="absolute"
        top="24px"
        left="calc(50% + 28px)"
        right="calc(-50% + 28px)"
        h="2px"
        bg="teal.200"
        zIndex={1}
      />
    )}
    <Text fontSize="18px" fontWeight="bold" mb={2}>
      {title}
    </Text>
    <Text fontSize="14px" color="fg.muted" lineHeight={1.7}>
      {body}
    </Text>
  </Box>
);

const FaqSection = () => {
  const [open, setOpen] = useState(0);
  return (
    <Box as="section" id="faq" px={{ base: 5, lg: 6 }} py={{ base: 12, lg: 24 }}>
      <Box mx="auto" w="full" maxW="720px">
        <VStack gap={0} textAlign="center">
          <Eyebrow>よくある質問</Eyebrow>
          <SectionHeading>聞きたいこと ぜんぶ</SectionHeading>
        </VStack>
        <VStack gap={3} align="stretch" mt={12}>
          {faqs.map((f, i) => (
            <FaqItem key={f.q} item={f} isOpen={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
          ))}
        </VStack>
      </Box>
    </Box>
  );
};

const FaqItem = ({ item, isOpen, onToggle }: { item: Faq; isOpen: boolean; onToggle: () => void }) => (
  <Box
    role="button"
    tabIndex={0}
    onClick={onToggle}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle();
      }
    }}
    textAlign="left"
    bg="white"
    borderWidth="1px"
    borderColor={isOpen ? "teal.300" : "gray.200"}
    borderLeftWidth="3px"
    borderLeftColor={isOpen ? "teal.600" : "teal.500"}
    borderRadius="8px"
    px={6}
    py={5}
    transition="border-color 200ms"
    cursor="pointer"
  >
    <Flex justify="space-between" align="center" fontWeight="bold" fontSize="16px">
      <Box as="span">{item.q}</Box>
      <Box
        as="span"
        color="teal.600"
        fontSize="20px"
        fontWeight="normal"
        transform={isOpen ? "rotate(45deg)" : "rotate(0)"}
        transition="transform 200ms"
      >
        +
      </Box>
    </Flex>
    <Box
      overflow="hidden"
      maxH={isOpen ? "200px" : "0"}
      mt={isOpen ? 3 : 0}
      transition="max-height 250ms ease, margin 200ms"
    >
      <Text fontSize="14px" color="fg.muted" lineHeight={1.8} whiteSpace="pre-line">
        {item.a}
      </Text>
    </Box>
  </Box>
);

const BottomCta = () => (
  <Box
    as="section"
    id="cta"
    bgGradient="to-b"
    gradientFrom="#f0fdfa"
    gradientTo="#ffffff"
    textAlign="center"
    px={{ base: 5, lg: 6 }}
    py={{ base: 16, lg: 24 }}
  >
    <VStack maxW="720px" mx="auto" gap={0}>
      <Eyebrow>はじめる</Eyebrow>
      <Heading
        as="h2"
        mt={5}
        fontSize={{ base: "26px", lg: "40px" }}
        fontWeight="bold"
        lineHeight={1.3}
        whiteSpace="pre-line"
      >
        {"今日のシフトから\nラクにしよう"}
      </Heading>
      <Text fontSize="16px" color="fg.muted" mt={4} mb={8}>
        登録は30秒 スタッフへの案内もワンクリック
      </Text>
      <Stack direction={{ base: "column", sm: "row" }} gap={4} justify="center" flexWrap="wrap">
        <SignUpButton mode="modal">
          <Button colorPalette="teal" h="56px" px={8} fontSize="18px" fontWeight="bold" borderRadius="full">
            ためしてみる <PiArrowRight />
          </Button>
        </SignUpButton>
        <SignInButton mode="modal">
          <Button
            variant="outline"
            colorPalette="teal"
            h="56px"
            px={8}
            fontSize="18px"
            fontWeight="bold"
            borderRadius="full"
            bg="white"
          >
            ログイン
          </Button>
        </SignInButton>
      </Stack>
    </VStack>
  </Box>
);

type FooterColLink = { label: string; href: string; router?: boolean };

export const Footer = () => (
  <Box as="footer" bg="teal.600" color="white" px={{ base: 5, lg: 6 }} pt={16} pb={10}>
    <Box
      mx="auto"
      maxW="1024px"
      display="grid"
      gridTemplateColumns={{ base: "1fr 1fr", lg: "1.2fr 1fr 1fr 1fr" }}
      gap={{ base: 8, lg: 12 }}
    >
      <VStack align="start" gap={3} gridColumn={{ base: "1 / -1", lg: "auto" }}>
        <HStack gap={2.5} fontWeight="bold" fontSize="18px">
          <Image src="/logo512.png" alt="" boxSize="28px" borderRadius="full" bg="whiteAlpha.300" p="3px" />
          <Box as="span">シフトリ</Box>
        </HStack>
        <Text fontSize="14px" opacity={0.85} lineHeight={1.7} maxW="260px">
          少人数のお店のシフトづくりを もっとラクに
        </Text>
      </VStack>
      <FooterCol
        title="Product"
        links={[
          { label: "できること", href: "/#features" },
          { label: "使い方", href: "/#how" },
        ]}
      />
      <FooterCol title="Support" links={[{ label: "よくある質問", href: "/#faq" }]} />
      <FooterCol
        title="Company"
        links={[
          { label: "利用規約", href: "/terms", router: true },
          { label: "プライバシー", href: "/privacy", router: true },
        ]}
      />
    </Box>
    <Flex
      mx="auto"
      maxW="1024px"
      mt={10}
      pt={6}
      borderTopWidth="1px"
      borderColor="whiteAlpha.300"
      fontSize="12px"
      opacity={0.7}
      justify="space-between"
      flexWrap="wrap"
      gap={2}
    >
      <Box as="span">
        © {new Date().getFullYear()} シフトリ v{__APP_VERSION__}
      </Box>
      <Box as="span">Made for 少人数のお店</Box>
    </Flex>
  </Box>
);

const FooterCol = ({ title, links }: { title: string; links: FooterColLink[] }) => (
  <VStack align="start" gap={2.5}>
    <Text fontSize="13px" fontWeight="bold" opacity={0.7} letterSpacing="0.08em" textTransform="uppercase" mb={1}>
      {title}
    </Text>
    {links.map(({ label, href, router }) =>
      router ? (
        <Link key={label} asChild color="white" fontSize="14px" _hover={{ opacity: 0.75, textDecoration: "none" }}>
          <RouterLink to={href}>{label}</RouterLink>
        </Link>
      ) : (
        <Link key={label} href={href} color="white" fontSize="14px" _hover={{ opacity: 0.75, textDecoration: "none" }}>
          {label}
        </Link>
      ),
    )}
  </VStack>
);

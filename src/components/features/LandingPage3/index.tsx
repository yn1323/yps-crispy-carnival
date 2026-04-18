import { Box, Button, Flex, Heading, HStack, Image, Link, Stack, Text, VStack } from "@chakra-ui/react";
import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { useState } from "react";
import { LuArrowUpRight, LuPlus } from "react-icons/lu";
import { type Faq, faqs } from "./faqs";

const FONTS_AND_KEYFRAMES = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;500;700&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,700;1,9..144,400&display=swap');

.lp3-root {
  font-family: "Noto Sans JP", system-ui, -apple-system, sans-serif;
  font-feature-settings: "palt";
}
.lp3-serif {
  font-family: "Fraunces", "Noto Serif JP", Georgia, serif;
  font-feature-settings: "ss01", "palt";
}
.lp3-paper {
  background-color: #F5EFE4;
  background-image:
    radial-gradient(at 10% 12%, rgba(184,92,56,0.06) 0%, transparent 45%),
    radial-gradient(at 88% 88%, rgba(15,118,110,0.05) 0%, transparent 40%);
}
.lp3-grain::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.38;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.12 0 0 0 0 0.10 0 0 0 0 0.08 0 0 0 0.35 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}
@keyframes lp3-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes lp3-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes lp3-scribble {
  from { stroke-dashoffset: 240; }
  to { stroke-dashoffset: 0; }
}
@keyframes lp3-drift {
  0%, 100% { transform: translateY(0) rotate(-1.5deg); }
  50% { transform: translateY(-6px) rotate(-0.5deg); }
}
.lp3-rise { animation: lp3-rise 800ms cubic-bezier(0.2,0.8,0.2,1) both; }
.lp3-fade { animation: lp3-fade 1200ms ease both; }
.lp3-bento-tile { transition: transform 260ms cubic-bezier(0.2,0.8,0.2,1), box-shadow 260ms ease; }
.lp3-bento-tile:hover { transform: translateY(-3px); }
.lp3-link-underline {
  background-image: linear-gradient(#B85C38, #B85C38);
  background-size: 100% 1px;
  background-position: 0 100%;
  background-repeat: no-repeat;
  transition: background-size 220ms ease;
}
.lp3-link-underline:hover { background-size: 100% 2px; }
`;

const INK = "#1E1B16";
const MUTED = "#6B5E52";
const PAPER = "#F5EFE4";
const RULE = "#C9BEAE";
const TERRA = "#B85C38";
const TERRA_SOFT = "#E8C9B8";
const SAND = "#E8DFD0";
const TEAL = "#0F766E";

export const LandingPage3 = () => (
  <Box className="lp3-root lp3-paper" minH="100vh" color={INK} position="relative">
    <style>{FONTS_AND_KEYFRAMES}</style>
    <Nav />
    <Masthead />
    <Hero />
    <Bento />
    <Letter />
    <HowItWorks />
    <Pricing />
    <FaqSection />
    <BottomCta />
    <Colophon />
  </Box>
);

const Nav = () => (
  <Box
    as="nav"
    position="sticky"
    top={0}
    zIndex={40}
    px={{ base: 5, lg: 10 }}
    py={4}
    bg="rgba(245,239,228,0.85)"
    style={{ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
    borderBottomWidth="1px"
    borderColor={RULE}
  >
    <Flex maxW="1120px" mx="auto" align="center" justify="space-between">
      <HStack gap={2.5}>
        <Flex boxSize="26px" borderRadius="full" bg={INK} align="center" justify="center" overflow="hidden" p="3px">
          <Image src="/logo512.png" alt="" boxSize="20px" />
        </Flex>
        <Text className="lp3-serif" fontSize="19px" fontWeight="500" letterSpacing="-0.01em">
          Shiftori
        </Text>
        <Text
          className="lp3-serif"
          fontSize="11px"
          fontStyle="italic"
          color={TERRA}
          letterSpacing="0.08em"
          textTransform="uppercase"
          display={{ base: "none", sm: "block" }}
        >
          vol. 03
        </Text>
      </HStack>
      <HStack gap={7} fontSize="13px" display={{ base: "none", md: "flex" }} color={MUTED}>
        <Link href="#bento" color="inherit" _hover={{ color: INK, textDecoration: "none" }}>
          できること
        </Link>
        <Link href="#how" color="inherit" _hover={{ color: INK, textDecoration: "none" }}>
          使い方
        </Link>
        <Link href="#pricing" color="inherit" _hover={{ color: INK, textDecoration: "none" }}>
          料金
        </Link>
        <Link href="#faq" color="inherit" _hover={{ color: INK, textDecoration: "none" }}>
          よくある質問
        </Link>
      </HStack>
      <SignUpButton mode="modal">
        <Button
          bg={INK}
          color={PAPER}
          _hover={{ bg: "#2d2822" }}
          h="36px"
          px={4}
          fontSize="13px"
          fontWeight="500"
          borderRadius="full"
        >
          はじめる
        </Button>
      </SignUpButton>
    </Flex>
  </Box>
);

const Masthead = () => (
  <Box px={{ base: 5, lg: 10 }} pt={{ base: 6, lg: 10 }} pb={{ base: 2, lg: 4 }}>
    <Flex
      maxW="1120px"
      mx="auto"
      align="center"
      justify="space-between"
      borderTopWidth="1px"
      borderBottomWidth="1px"
      borderColor={RULE}
      py={3}
      fontSize="11px"
      letterSpacing="0.12em"
      textTransform="uppercase"
      color={MUTED}
      gap={4}
      flexWrap="wrap"
    >
      <Box as="span">Shiftori Journal — Issue 03</Box>
      <Box as="span" display={{ base: "none", md: "block" }}>
        少人数のお店のためのシフトづくり
      </Box>
      <Box as="span">April 2026</Box>
    </Flex>
  </Box>
);

const Hero = () => (
  <Box as="section" px={{ base: 5, lg: 10 }} pt={{ base: 10, lg: 16 }} pb={{ base: 16, lg: 28 }}>
    <Box
      maxW="1120px"
      mx="auto"
      display="grid"
      gridTemplateColumns={{ base: "1fr", lg: "1.35fr 1fr" }}
      gap={{ base: 12, lg: 16 }}
      alignItems="start"
    >
      <VStack align="stretch" gap={0} className="lp3-rise">
        <HStack gap={3} color={TERRA} mb={{ base: 6, lg: 8 }}>
          <Box w="48px" h="1px" bg={TERRA} />
          <Text fontSize="12px" letterSpacing="0.18em" textTransform="uppercase" fontWeight="500">
            feature · 01
          </Text>
        </HStack>
        <Heading
          as="h1"
          className="lp3-serif"
          fontSize={{ base: "46px", md: "72px", lg: "96px" }}
          fontWeight="500"
          lineHeight={0.98}
          letterSpacing="-0.035em"
          color={INK}
        >
          シフト作り
          <Box as="br" />
          <Box as="span" fontStyle="italic" color={TERRA}>
            もっと
          </Box>
          <Box as="br" />
          ラクに
          <Box as="span" className="lp3-serif" color={TERRA}>
            .
          </Box>
        </Heading>
        <Text
          mt={{ base: 8, lg: 10 }}
          fontSize={{ base: "16px", lg: "19px" }}
          lineHeight={1.85}
          maxW="520px"
          color={MUTED}
        >
          募集から確定まで ひとつの場所で
          <Box as="br" display={{ base: "none", md: "block" }} />
          少人数のお店のシフトづくり ぜんぶおまかせ
        </Text>
        <Stack direction={{ base: "column", sm: "row" }} mt={{ base: 10, lg: 12 }} gap={4} align="stretch">
          <SignUpButton mode="modal">
            <Button
              bg={INK}
              color={PAPER}
              _hover={{ bg: "#2d2822" }}
              h="56px"
              px={7}
              fontSize="16px"
              fontWeight="500"
              borderRadius="0"
              className="lp3-serif"
            >
              ためしてみる <LuArrowUpRight />
            </Button>
          </SignUpButton>
          <Button
            asChild
            variant="outline"
            borderColor={INK}
            color={INK}
            bg="transparent"
            _hover={{ bg: SAND }}
            h="56px"
            px={7}
            fontSize="16px"
            fontWeight="500"
            borderRadius="0"
            className="lp3-serif"
          >
            <a href="#how">使い方を読む</a>
          </Button>
        </Stack>
        <HStack mt={10} gap={6} fontSize="12px" color={MUTED} flexWrap="wrap" letterSpacing="0.04em">
          <HStack gap={2}>
            <Box boxSize="5px" borderRadius="full" bg={TERRA} />
            <Box as="span">登録30秒</Box>
          </HStack>
          <HStack gap={2}>
            <Box boxSize="5px" borderRadius="full" bg={TERRA} />
            <Box as="span">アプリ不要</Box>
          </HStack>
          <HStack gap={2}>
            <Box boxSize="5px" borderRadius="full" bg={TERRA} />
            <Box as="span">いま無料</Box>
          </HStack>
        </HStack>
      </VStack>

      <HeroArtwork />
    </Box>
  </Box>
);

const HeroArtwork = () => (
  <Box position="relative" minH={{ base: "340px", lg: "520px" }} className="lp3-fade">
    {/* paper slip — behind */}
    <Box
      position="absolute"
      top={{ base: "12px", lg: "28px" }}
      right={{ base: "12px", lg: "0" }}
      w={{ base: "76%", lg: "90%" }}
      aspectRatio="3 / 4"
      bg={SAND}
      boxShadow="8px 10px 0 0 rgba(30,27,22,0.08)"
      style={{ transform: "rotate(2.5deg)" }}
    />
    {/* main card — paper "clipping" */}
    <Box
      position="relative"
      ml={{ base: 0, lg: 4 }}
      mt={{ base: 4, lg: 10 }}
      bg="#FBF6EC"
      borderWidth="1px"
      borderColor={RULE}
      p={{ base: 5, lg: 6 }}
      boxShadow="0 22px 50px -24px rgba(30,27,22,0.25)"
      className="lp3-grain"
      overflow="hidden"
    >
      <Flex align="center" justify="space-between" mb={4}>
        <Text
          className="lp3-serif"
          fontSize="11px"
          fontStyle="italic"
          color={TERRA}
          letterSpacing="0.1em"
          textTransform="uppercase"
        >
          a typical Saturday
        </Text>
        <Text fontSize="10px" color={MUTED} letterSpacing="0.08em">
          5 / 2 (sat)
        </Text>
      </Flex>
      <VStack align="stretch" gap={0}>
        {HERO_ROWS.map((row, i) => (
          <Flex
            key={row.name}
            align="center"
            h="32px"
            borderBottomWidth={i === HERO_ROWS.length - 1 ? "0" : "1px"}
            borderColor={RULE}
            borderStyle="dashed"
            className="lp3-rise"
            style={{ animationDelay: `${200 + i * 90}ms` }}
          >
            <Text w="68px" fontSize="11px" color={INK} className="lp3-serif" fontWeight="500" lineClamp={1}>
              {row.name}
            </Text>
            <Box position="relative" flex={1} h="10px">
              <Box
                position="absolute"
                top="50%"
                left="0"
                right="0"
                h="1px"
                bg={RULE}
                style={{ transform: "translateY(-50%)" }}
              />
              <Box
                position="absolute"
                top="0"
                bottom="0"
                left={`${row.start}%`}
                w={`${row.width}%`}
                bg={row.tone === "accent" ? TERRA : INK}
                opacity={row.tone === "accent" ? 1 : 0.82}
              />
            </Box>
            <Text w="60px" textAlign="right" fontSize="10px" color={MUTED} letterSpacing="0.04em">
              {row.hours}
            </Text>
          </Flex>
        ))}
      </VStack>
      <HStack
        mt={5}
        pt={4}
        borderTopWidth="1px"
        borderColor={RULE}
        fontSize="10px"
        color={MUTED}
        justify="space-between"
      >
        <Text>提出 6/6</Text>
        <Text className="lp3-serif" fontStyle="italic" color={TERRA}>
          — 確定済み
        </Text>
      </HStack>
    </Box>
    {/* margin stamp */}
    <Box
      position="absolute"
      bottom={{ base: "-12px", lg: "-20px" }}
      left={{ base: "-6px", lg: "-24px" }}
      bg={TERRA}
      color={PAPER}
      px={3}
      py={1.5}
      className="lp3-serif"
      fontStyle="italic"
      fontSize="12px"
      letterSpacing="0.08em"
      style={{ transform: "rotate(-4deg)", animation: "lp3-drift 5s ease-in-out infinite" }}
    >
      one click away
    </Box>
  </Box>
);

const HERO_ROWS: { name: string; start: number; width: number; tone: "ink" | "accent"; hours: string }[] = [
  { name: "Yamamoto", start: 10, width: 40, tone: "ink", hours: "10–14" },
  { name: "Tanaka", start: 22, width: 48, tone: "accent", hours: "12–17" },
  { name: "Sato", start: 6, width: 28, tone: "ink", hours: "09–12" },
  { name: "Suzuki", start: 42, width: 40, tone: "ink", hours: "14–19" },
  { name: "Yoshida", start: 56, width: 36, tone: "accent", hours: "16–20" },
];

const BENTO_TILES: {
  area: string;
  eyebrow: string;
  title: string;
  body: string;
  bg: string;
  color: string;
  accent?: "terra" | "teal" | "ink" | "soft";
  decoration?: "dots" | "rule" | "slash" | "paper";
}[] = [
  {
    area: "hero",
    eyebrow: "01 · Broadcast",
    title: "募集は ワンクリック",
    body: "期間を決めて 全員に一斉送信\nリンクを開くだけで提出できる 登録もアプリも不要",
    bg: INK,
    color: PAPER,
    accent: "terra",
    decoration: "dots",
  },
  {
    area: "tall",
    eyebrow: "02 · Tap to submit",
    title: "希望は 日ごとにタップ",
    body: "休みか 時間帯か\nスマホのブラウザだけで完結",
    bg: TERRA,
    color: PAPER,
    decoration: "rule",
  },
  {
    area: "short1",
    eyebrow: "03",
    title: "確定も ワンクリック",
    body: "ボタンひとつで全員に届く",
    bg: "#FBF6EC",
    color: INK,
    accent: "ink",
    decoration: "slash",
  },
  {
    area: "wide",
    eyebrow: "04 · Zero onboarding",
    title: "スタッフの 登録はゼロ",
    body: "お店のオーナーさんが始めれば スタッフはリンクを開くだけ\nアプリもインストール不要 いつものブラウザで",
    bg: SAND,
    color: INK,
    accent: "terra",
    decoration: "paper",
  },
  {
    area: "short2",
    eyebrow: "05 · Chat",
    title: "LINEのかわりに",
    body: "連絡も ここでまとめて",
    bg: TERRA_SOFT,
    color: INK,
    decoration: "rule",
  },
  {
    area: "short3",
    eyebrow: "06 · Archive",
    title: "過去シフト 全部残る",
    body: "月ごとの振り返り\n人件費のざっくり確認にも",
    bg: "#FBF6EC",
    color: INK,
    accent: "teal",
    decoration: "dots",
  },
];

const Bento = () => (
  <Box
    as="section"
    id="bento"
    px={{ base: 5, lg: 10 }}
    py={{ base: 16, lg: 28 }}
    borderTopWidth="1px"
    borderColor={RULE}
  >
    <Box maxW="1120px" mx="auto">
      <SectionEyebrow num="II" label="できること" />
      <SectionTitle>
        小さなお店の
        <Box as="br" />
        <Box as="em" fontStyle="italic" color={TERRA}>
          ぜんぶ
        </Box>
        を ここで
      </SectionTitle>

      <Box
        mt={{ base: 10, lg: 16 }}
        display="grid"
        gap={{ base: 3, lg: 4 }}
        gridTemplateColumns={{ base: "1fr", md: "repeat(6, 1fr)" }}
        gridTemplateAreas={{
          base: `"hero" "tall" "short1" "wide" "short2" "short3"`,
          md: `
            "hero hero hero hero tall tall"
            "short1 short1 wide wide tall tall"
            "short1 short1 wide wide short2 short3"
          `,
        }}
      >
        {BENTO_TILES.map((tile) => (
          <BentoTile key={tile.area} {...tile} />
        ))}
      </Box>
    </Box>
  </Box>
);

const BentoTile = ({ area, eyebrow, title, body, bg, color, accent, decoration }: (typeof BENTO_TILES)[number]) => {
  const accentColor = accent === "terra" ? TERRA : accent === "teal" ? TEAL : accent === "soft" ? TERRA_SOFT : color;
  const isHero = area === "hero";
  const isTall = area === "tall";
  const isWide = area === "wide";
  const fontScale = isHero ? "xl" : isTall || isWide ? "lg" : "md";

  return (
    <Box
      gridArea={area}
      className="lp3-bento-tile"
      position="relative"
      bg={bg}
      color={color}
      p={{ base: 5, lg: isHero ? 10 : 7 }}
      borderWidth={bg === "#FBF6EC" ? "1px" : "0"}
      borderColor={RULE}
      display="flex"
      flexDirection="column"
      justifyContent="space-between"
      minH={{ base: isHero ? "260px" : isTall ? "340px" : "200px", md: isHero ? "340px" : "auto" }}
      overflow="hidden"
    >
      <TileDecoration decoration={decoration} color={accentColor} />
      <HStack gap={2.5} color={accentColor} mb={3} zIndex={1} position="relative">
        <Text fontSize="10px" letterSpacing="0.18em" textTransform="uppercase" fontWeight="500" opacity={0.85}>
          {eyebrow}
        </Text>
      </HStack>
      <Box zIndex={1} position="relative" flex={1}>
        <Heading
          as="h3"
          className="lp3-serif"
          fontSize={{
            base: fontScale === "xl" ? "30px" : fontScale === "lg" ? "24px" : "20px",
            lg: fontScale === "xl" ? "44px" : fontScale === "lg" ? "30px" : "22px",
          }}
          fontWeight="500"
          lineHeight={1.15}
          letterSpacing="-0.02em"
          mb={3}
          mt={{ base: 10, lg: isHero ? 16 : 10 }}
        >
          {title}
        </Heading>
        <Text
          fontSize={{ base: "13px", lg: isHero || isTall ? "15px" : "13px" }}
          lineHeight={1.8}
          opacity={color === PAPER ? 0.85 : 0.75}
          whiteSpace="pre-line"
        >
          {body}
        </Text>
      </Box>
    </Box>
  );
};

const TileDecoration = ({
  decoration,
  color,
}: {
  decoration: "dots" | "rule" | "slash" | "paper" | undefined;
  color: string;
}) => {
  if (decoration === "dots") {
    return (
      <Box
        position="absolute"
        top={5}
        right={5}
        display="grid"
        gridTemplateColumns="repeat(4, 1fr)"
        gap="4px"
        opacity={0.55}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <Box key={i} boxSize="4px" borderRadius="full" bg={color} />
        ))}
      </Box>
    );
  }
  if (decoration === "rule") {
    return <Box position="absolute" top={5} right={5} w="54px" h="2px" bg={color} opacity={0.9} />;
  }
  if (decoration === "slash") {
    return (
      <Text
        position="absolute"
        top={4}
        right={5}
        className="lp3-serif"
        fontStyle="italic"
        fontSize="34px"
        color={color}
        opacity={0.35}
        lineHeight={1}
      >
        ✓
      </Text>
    );
  }
  if (decoration === "paper") {
    return (
      <Box
        position="absolute"
        top={5}
        right={5}
        w="48px"
        h="60px"
        bg="rgba(30,27,22,0.06)"
        style={{ transform: "rotate(6deg)" }}
      />
    );
  }
  return null;
};

const Letter = () => (
  <Box as="section" px={{ base: 5, lg: 10 }} py={{ base: 16, lg: 28 }} bg="#EFE7D8">
    <Box maxW="820px" mx="auto" position="relative" textAlign="center">
      <Text
        className="lp3-serif"
        fontSize={{ base: "80px", lg: "140px" }}
        fontStyle="italic"
        color={TERRA}
        lineHeight={0.6}
        opacity={0.7}
        mb={-2}
      >
        &ldquo;
      </Text>
      <Heading
        as="blockquote"
        className="lp3-serif"
        fontSize={{ base: "24px", lg: "38px" }}
        fontWeight="400"
        lineHeight={1.55}
        letterSpacing="-0.015em"
        color={INK}
      >
        毎月末のシフト作り
        <Box as="br" />
        ぜんぶ紙とLINEでやってた
        <Box as="br" />
        いまは 日曜の夜に
        <Box as="br" />
        <Box as="em" fontStyle="italic" color={TERRA}>
          ボタンひとつ
        </Box>
        で終わる
      </Heading>
      <HStack justify="center" mt={10} gap={3} color={MUTED}>
        <Box w="32px" h="1px" bg={RULE} />
        <Text fontSize="12px" letterSpacing="0.14em" textTransform="uppercase">
          cafe owner · tokyo
        </Text>
        <Box w="32px" h="1px" bg={RULE} />
      </HStack>
    </Box>
  </Box>
);

const STEPS: { title: string; body: string }[] = [
  {
    title: "募集をつくる",
    body: "期間を決めて スタッフ全員にリンクを配る",
  },
  {
    title: "希望が集まる",
    body: "それぞれが都合のいいときに 休みや時間帯をタップ",
  },
  {
    title: "確定して通知",
    body: "微調整したらボタンひとつで全員に反映",
  },
];

const HowItWorks = () => (
  <Box as="section" id="how" px={{ base: 5, lg: 10 }} py={{ base: 16, lg: 28 }} borderTopWidth="1px" borderColor={RULE}>
    <Box maxW="1120px" mx="auto">
      <SectionEyebrow num="III" label="使い方" />
      <SectionTitle>
        <Box as="em" fontStyle="italic" color={TERRA}>
          三つ
        </Box>
        のステップで
      </SectionTitle>
      <Box
        mt={{ base: 12, lg: 20 }}
        display="grid"
        gridTemplateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
        gap={{ base: 10, lg: 0 }}
      >
        {STEPS.map((s, i) => (
          <StepCard key={s.title} index={i} total={STEPS.length} {...s} />
        ))}
      </Box>
    </Box>
  </Box>
);

const StepCard = ({ index, total, title, body }: { index: number; total: number; title: string; body: string }) => (
  <Box
    position="relative"
    px={{ base: 0, md: 7, lg: 10 }}
    borderLeftWidth={{ base: 0, md: index === 0 ? "0" : "1px" }}
    borderColor={RULE}
  >
    <Text
      className="lp3-serif"
      fontSize={{ base: "88px", lg: "120px" }}
      fontWeight="400"
      lineHeight={0.9}
      letterSpacing="-0.04em"
      color={TERRA}
      mb={4}
    >
      {String(index + 1).padStart(2, "0")}
    </Text>
    <Heading
      as="h3"
      className="lp3-serif"
      fontSize={{ base: "22px", lg: "26px" }}
      fontWeight="500"
      mb={3}
      letterSpacing="-0.015em"
    >
      {title}
    </Heading>
    <Text fontSize="14px" color={MUTED} lineHeight={1.85}>
      {body}
    </Text>
    {index < total - 1 && (
      <Text
        display={{ base: "none", md: "block" }}
        position="absolute"
        top="38px"
        right={{ md: "-12px", lg: "-16px" }}
        className="lp3-serif"
        fontStyle="italic"
        color={RULE}
        fontSize="28px"
      >
        →
      </Text>
    )}
  </Box>
);

const PRICING_FEATURES = [
  "スタッフ数 無制限",
  "募集回数 無制限",
  "確定 通知機能",
  "過去のシフト 振り返り",
  "連絡もひとつの場所で",
];

const Pricing = () => (
  <Box as="section" id="pricing" px={{ base: 5, lg: 10 }} py={{ base: 16, lg: 28 }} bg="#EFE7D8">
    <Box maxW="1120px" mx="auto">
      <SectionEyebrow num="IV" label="料金" />
      <SectionTitle>
        <Box as="em" fontStyle="italic" color={TERRA}>
          いまは
        </Box>
        ぜんぶ 無料
      </SectionTitle>
      <Box
        maxW="720px"
        mx="auto"
        mt={{ base: 10, lg: 16 }}
        bg={PAPER}
        borderWidth="1px"
        borderColor={INK}
        p={{ base: 6, lg: 10 }}
        position="relative"
      >
        {/* corner marks */}
        {[
          { top: "-1px", left: "-1px" },
          { top: "-1px", right: "-1px" },
          { bottom: "-1px", left: "-1px" },
          { bottom: "-1px", right: "-1px" },
        ].map((pos, i) => (
          <Box key={i} position="absolute" boxSize="12px" borderWidth="2px" borderColor={TERRA} style={pos} />
        ))}
        <Flex
          align={{ base: "flex-start", md: "baseline" }}
          justify="space-between"
          gap={6}
          direction={{ base: "column", md: "row" }}
          borderBottomWidth="1px"
          borderColor={RULE}
          pb={6}
          mb={8}
        >
          <Box>
            <Text
              fontSize="11px"
              letterSpacing="0.18em"
              textTransform="uppercase"
              color={TERRA}
              mb={1}
              fontWeight="500"
            >
              Early access
            </Text>
            <Text className="lp3-serif" fontSize="22px" fontWeight="500" letterSpacing="-0.01em">
              Shiftori — 基本プラン
            </Text>
          </Box>
          <HStack align="baseline" gap={1}>
            <Text
              className="lp3-serif"
              fontSize={{ base: "64px", lg: "84px" }}
              fontWeight="500"
              lineHeight={0.9}
              color={INK}
              letterSpacing="-0.04em"
            >
              ¥0
            </Text>
            <Text fontSize="14px" color={MUTED}>
              / 月
            </Text>
          </HStack>
        </Flex>
        <VStack align="stretch" gap={3.5} mb={8}>
          {PRICING_FEATURES.map((f, i) => (
            <HStack
              key={f}
              gap={4}
              pb={3}
              borderBottomWidth={i === PRICING_FEATURES.length - 1 ? "0" : "1px"}
              borderColor={RULE}
              borderStyle="dashed"
            >
              <Text
                className="lp3-serif"
                fontStyle="italic"
                color={TERRA}
                fontSize="14px"
                w="28px"
                letterSpacing="0.02em"
              >
                {String(i + 1).padStart(2, "0")}
              </Text>
              <Text fontSize="15px" color={INK}>
                {f}
              </Text>
            </HStack>
          ))}
        </VStack>
        <SignUpButton mode="modal">
          <Button
            bg={INK}
            color={PAPER}
            _hover={{ bg: "#2d2822" }}
            w="full"
            h="56px"
            fontSize="16px"
            fontWeight="500"
            borderRadius="0"
            className="lp3-serif"
          >
            無料で ためしてみる <LuArrowUpRight />
          </Button>
        </SignUpButton>
        <Text fontSize="11px" color={MUTED} textAlign="center" mt={4} letterSpacing="0.04em">
          クレジットカード不要 いつでもやめられる
        </Text>
      </Box>
    </Box>
  </Box>
);

const FaqSection = () => {
  const [open, setOpen] = useState(0);
  return (
    <Box
      as="section"
      id="faq"
      px={{ base: 5, lg: 10 }}
      py={{ base: 16, lg: 28 }}
      borderTopWidth="1px"
      borderColor={RULE}
    >
      <Box maxW="820px" mx="auto">
        <SectionEyebrow num="V" label="よくある質問" />
        <SectionTitle>
          聞きたいこと
          <Box as="br" />
          <Box as="em" fontStyle="italic" color={TERRA}>
            ぜんぶ
          </Box>
        </SectionTitle>
        <VStack align="stretch" gap={0} mt={{ base: 10, lg: 14 }} borderTopWidth="1px" borderColor={INK}>
          {faqs.map((f, i) => (
            <FaqRow key={f.q} item={f} isOpen={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
          ))}
        </VStack>
      </Box>
    </Box>
  );
};

const FaqRow = ({ item, isOpen, onToggle }: { item: Faq; isOpen: boolean; onToggle: () => void }) => (
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
    borderBottomWidth="1px"
    borderColor={INK}
    py={6}
    cursor="pointer"
    transition="background 200ms ease"
    _hover={{ bg: "rgba(30,27,22,0.03)" }}
  >
    <Flex justify="space-between" align="center" gap={6}>
      <Heading
        as="h4"
        className="lp3-serif"
        fontSize={{ base: "18px", lg: "22px" }}
        fontWeight="500"
        letterSpacing="-0.01em"
      >
        {item.q}
      </Heading>
      <Box
        color={TERRA}
        transform={isOpen ? "rotate(45deg)" : "rotate(0deg)"}
        transition="transform 260ms cubic-bezier(0.2,0.8,0.2,1)"
        flexShrink={0}
      >
        <LuPlus size={22} />
      </Box>
    </Flex>
    <Box
      overflow="hidden"
      maxH={isOpen ? "240px" : "0"}
      mt={isOpen ? 4 : 0}
      transition="max-height 320ms ease, margin 240ms ease"
    >
      <Text fontSize="15px" color={MUTED} lineHeight={1.9} whiteSpace="pre-line" maxW="640px">
        {item.a}
      </Text>
    </Box>
  </Box>
);

const BottomCta = () => (
  <Box as="section" id="cta" px={{ base: 5, lg: 10 }} py={{ base: 20, lg: 32 }} bg={INK} color={PAPER}>
    <Box maxW="920px" mx="auto" textAlign="center">
      <HStack justify="center" gap={3} mb={6}>
        <Box w="40px" h="1px" bg={TERRA} />
        <Text fontSize="11px" letterSpacing="0.18em" textTransform="uppercase" color={TERRA}>
          end matter
        </Text>
        <Box w="40px" h="1px" bg={TERRA} />
      </HStack>
      <Heading
        as="h2"
        className="lp3-serif"
        fontSize={{ base: "40px", lg: "72px" }}
        fontWeight="500"
        lineHeight={1.05}
        letterSpacing="-0.03em"
      >
        今日のシフトから
        <Box as="br" />
        <Box as="em" fontStyle="italic" color={TERRA_SOFT}>
          ラクに
        </Box>
        しよう
      </Heading>
      <Text mt={8} fontSize={{ base: "15px", lg: "17px" }} opacity={0.72} lineHeight={1.85}>
        登録は30秒 スタッフへの案内もワンクリック
      </Text>
      <Stack direction={{ base: "column", sm: "row" }} mt={10} gap={4} justify="center">
        <SignUpButton mode="modal">
          <Button
            bg={PAPER}
            color={INK}
            _hover={{ bg: "#e8ddc8" }}
            h="58px"
            px={8}
            fontSize="16px"
            fontWeight="500"
            borderRadius="0"
            className="lp3-serif"
          >
            ためしてみる <LuArrowUpRight />
          </Button>
        </SignUpButton>
        <SignInButton mode="modal">
          <Button
            variant="outline"
            borderColor={PAPER}
            color={PAPER}
            bg="transparent"
            _hover={{ bg: "whiteAlpha.100" }}
            h="58px"
            px={8}
            fontSize="16px"
            fontWeight="500"
            borderRadius="0"
            className="lp3-serif"
          >
            ログイン
          </Button>
        </SignInButton>
      </Stack>
    </Box>
  </Box>
);

const Colophon = () => (
  <Box as="footer" px={{ base: 5, lg: 10 }} py={{ base: 12, lg: 16 }}>
    <Box maxW="1120px" mx="auto">
      <Flex
        borderTopWidth="1px"
        borderColor={RULE}
        pt={6}
        align="flex-start"
        justify="space-between"
        gap={8}
        flexDirection={{ base: "column", md: "row" }}
      >
        <HStack gap={3}>
          <Flex boxSize="32px" borderRadius="full" bg={INK} align="center" justify="center" p="4px">
            <Image src="/logo512.png" alt="" boxSize="24px" />
          </Flex>
          <Box>
            <Text className="lp3-serif" fontSize="18px" fontWeight="500" letterSpacing="-0.01em">
              Shiftori Journal
            </Text>
            <Text fontSize="11px" color={MUTED} letterSpacing="0.06em">
              少人数のお店のシフトづくり
            </Text>
          </Box>
        </HStack>
        <Box
          display="grid"
          gridTemplateColumns={{ base: "1fr 1fr", md: "repeat(3, auto)" }}
          gap={{ base: 6, md: 10 }}
          fontSize="13px"
        >
          <FooterCol
            title="Index"
            links={[
              ["できること", "#bento"],
              ["使い方", "#how"],
              ["料金", "#pricing"],
            ]}
          />
          <FooterCol
            title="Support"
            links={[
              ["よくある質問", "#faq"],
              ["お問い合わせ", "#"],
            ]}
          />
          <FooterCol
            title="About"
            links={[
              ["運営会社", "#"],
              ["利用規約", "#"],
              ["プライバシー", "#"],
            ]}
          />
        </Box>
      </Flex>
      <Flex
        mt={10}
        pt={5}
        borderTopWidth="1px"
        borderColor={RULE}
        fontSize="11px"
        color={MUTED}
        justify="space-between"
        flexWrap="wrap"
        gap={3}
        letterSpacing="0.08em"
      >
        <Text>© {new Date().getFullYear()} Shiftori — vol. 03</Text>
        <Text className="lp3-serif" fontStyle="italic">
          Printed with care for 少人数のお店
        </Text>
      </Flex>
    </Box>
  </Box>
);

const FooterCol = ({ title, links }: { title: string; links: [string, string][] }) => (
  <VStack align="start" gap={2}>
    <Text fontSize="10px" letterSpacing="0.16em" textTransform="uppercase" color={TERRA} mb={1} fontWeight="500">
      {title}
    </Text>
    {links.map(([label, href]) => (
      <Link key={label} href={href} color={INK} fontSize="13px" _hover={{ color: TERRA, textDecoration: "none" }}>
        {label}
      </Link>
    ))}
  </VStack>
);

const SectionEyebrow = ({ num, label }: { num: string; label: string }) => (
  <HStack gap={3} color={TERRA}>
    <Text className="lp3-serif" fontStyle="italic" fontSize="18px" fontWeight="500">
      {num}.
    </Text>
    <Box w="40px" h="1px" bg={TERRA} />
    <Text fontSize="12px" letterSpacing="0.18em" textTransform="uppercase" fontWeight="500">
      {label}
    </Text>
  </HStack>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Heading
    as="h2"
    className="lp3-serif"
    mt={5}
    fontSize={{ base: "38px", lg: "68px" }}
    fontWeight="500"
    lineHeight={1.05}
    letterSpacing="-0.03em"
    color={INK}
  >
    {children}
  </Heading>
);

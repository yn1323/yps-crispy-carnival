import { Box, Flex, Heading, HStack, Image, SimpleGrid, Stack, Text, VStack } from "@chakra-ui/react";
import {
  LuArrowRight,
  LuBell,
  LuCalendarCheck,
  LuCheck,
  LuCirclePlay,
  LuMail,
  LuPencil,
  LuSparkles,
  LuTable2,
  LuUserCheck,
} from "react-icons/lu";
import { BrowserMockup } from "@/src/components/ui/BrowserMockup";
import { Button } from "@/src/components/ui/Button";
import heroIllustration from "../assets/hero-store-manager.svg";

const features = [
  { icon: LuUserCheck, title: "スタッフはアプリ不要", body: "届いたリンクから希望を提出できます。" },
  { icon: LuMail, title: "LINE/メールで回収", body: "連絡先に合わせて希望提出を案内できます。" },
  { icon: LuTable2, title: "希望が表にまとまる", body: "提出された希望をシフト表で確認できます。" },
  { icon: LuPencil, title: "店長が手直し", body: "表を見ながらいつもの感覚で調整できます。" },
  { icon: LuBell, title: "確定通知まで", body: "完成したらスタッフへまとめて知らせます。" },
];

export const LandingCatalogMock = () => (
  <Box bg="#fbfdfd" color="#1f292b" minH="100vh">
    <CatalogNav />
    <Box as="main">
      <CatalogHero />
      <FeatureGrid />
      <ProductPreview />
      <AiPreview />
      <CatalogTrust />
      <CatalogCta />
    </Box>
  </Box>
);

const CatalogNav = () => (
  <Flex as="header" align="center" justify="space-between" maxW="1160px" mx="auto" px={{ base: 5, lg: 8 }} py={5}>
    <HStack gap={3}>
      <Flex
        boxSize="34px"
        borderRadius="10px"
        bg="#d8eff4"
        color="#177f98"
        align="center"
        justify="center"
        fontWeight="bold"
      >
        シ
      </Flex>
      <Text fontWeight="bold" fontSize="18px">
        シフトリ
      </Text>
    </HStack>
    <HStack gap={6} display={{ base: "none", md: "flex" }} fontSize="14px" fontWeight="bold" color="#536063">
      <Text>できること</Text>
      <Text>デモ</Text>
      <Text>FAQ</Text>
    </HStack>
    <Button bg="#177f98" color="white" _hover={{ bg: "#126b80" }}>
      使ってみる
    </Button>
  </Flex>
);

const CatalogHero = () => (
  <Box as="section" px={{ base: 5, lg: 8 }} pt={{ base: 8, lg: 14 }} pb={{ base: 14, lg: 22 }}>
    <SimpleGrid columns={{ base: 1, lg: 2 }} gap={{ base: 10, lg: 14 }} alignItems="center" maxW="1160px" mx="auto">
      <VStack align="start" gap={6}>
        <Text color="#177f98" fontSize="14px" fontWeight="bold">
          小さなお店のためのシフト管理SaaS
        </Text>
        <Heading as="h1" fontSize={{ base: "40px", md: "56px", lg: "64px" }} lineHeight={1.18} letterSpacing="0">
          LINEで集めて、Excelに転記。
          <Box as="span" display="block" color="#177f98">
            そんなシフト作成を、もっとラクに。
          </Box>
        </Heading>
        <Text fontSize={{ base: "16px", lg: "18px" }} lineHeight={1.9} color="#536063" maxW="560px">
          希望回収、提出状況の確認、シフト表の手直し、確定通知まで。必要な作業をひとつの画面で進められます。
        </Text>
        <Stack direction={{ base: "column", sm: "row" }} gap={4} w={{ base: "full", sm: "auto" }}>
          <Button h="56px" px={8} bg="#177f98" color="white" fontWeight="bold" _hover={{ bg: "#126b80" }}>
            さっそく使ってみる
            <LuArrowRight />
          </Button>
          <Button h="56px" px={8} variant="outline" color="#177f98" borderColor="#9bd8df" fontWeight="bold">
            <LuCirclePlay />
            デモを見る
          </Button>
        </Stack>
      </VStack>
      <Box position="relative">
        <ProductHeroPanel />
        <Image
          src={heroIllustration}
          alt="シフト表を確認する店長のイラスト"
          position="absolute"
          right={{ base: "-12px", lg: "-40px" }}
          bottom={{ base: "-56px", lg: "-64px" }}
          w={{ base: "180px", md: "240px", lg: "280px" }}
          bg="white"
          borderRadius="20px"
          borderWidth="2px"
          borderColor="#1f292b"
          p={2}
          display={{ base: "none", sm: "block" }}
        />
      </Box>
    </SimpleGrid>
  </Box>
);

const FeatureGrid = () => (
  <Box as="section" px={{ base: 5, lg: 8 }} py={{ base: 14, lg: 20 }} bg="white">
    <VStack gap={5} maxW="720px" mx="auto" textAlign="center" mb={{ base: 10, lg: 14 }}>
      <CatalogKicker>Features</CatalogKicker>
      <Heading as="h2" fontSize={{ base: "30px", lg: "44px" }} lineHeight={1.35} letterSpacing="0">
        シフト作成に必要なことを、迷わず使える形に。
      </Heading>
    </VStack>
    <SimpleGrid columns={{ base: 1, md: 2, lg: 5 }} gap={4} maxW="1160px" mx="auto">
      {features.map(({ icon: Icon, title, body }) => (
        <Box key={title} borderWidth="1px" borderColor="#d8e6e8" borderRadius="8px" p={5} bg="#fbfdfd">
          <Flex boxSize="42px" borderRadius="12px" bg="#d8eff4" color="#177f98" align="center" justify="center" mb={5}>
            <Icon size={22} />
          </Flex>
          <Heading as="h3" fontSize="18px" lineHeight={1.45} mb={2} letterSpacing="0">
            {title}
          </Heading>
          <Text color="#536063" fontSize="14px" lineHeight={1.8}>
            {body}
          </Text>
        </Box>
      ))}
    </SimpleGrid>
  </Box>
);

const ProductPreview = () => (
  <Box as="section" px={{ base: 5, lg: 8 }} py={{ base: 14, lg: 22 }}>
    <SimpleGrid columns={{ base: 1, lg: 2 }} gap={{ base: 10, lg: 14 }} alignItems="center" maxW="1160px" mx="auto">
      <VStack align="start" gap={5}>
        <CatalogKicker>Preview</CatalogKicker>
        <Heading as="h2" fontSize={{ base: "30px", lg: "44px" }} lineHeight={1.35} letterSpacing="0">
          PCではシフト表、スタッフはスマホ。
        </Heading>
        <Text color="#536063" lineHeight={1.9} fontSize={{ base: "15px", lg: "17px" }}>
          店長は大きな表で全体を見ながら調整。スタッフはスマホで希望を出すだけ。使う人ごとに必要な画面だけを見せます。
        </Text>
      </VStack>
      <Box position="relative" pb={{ base: 24, md: 16 }}>
        <BrowserMockup url="shiftori.app/shiftboard">
          <SchedulePreview />
        </BrowserMockup>
        <PhonePreview />
      </Box>
    </SimpleGrid>
  </Box>
);

const AiPreview = () => (
  <Box as="section" px={{ base: 5, lg: 8 }} py={{ base: 12, lg: 18 }} bg="#eef9fa">
    <Box
      display="grid"
      gridTemplateColumns={{ base: "1fr", lg: "1.1fr 0.9fr" }}
      gap={8}
      maxW="1040px"
      mx="auto"
      alignItems="center"
    >
      <VStack align="start" gap={4}>
        <CatalogKicker>Next</CatalogKicker>
        <Heading as="h2" fontSize={{ base: "28px", lg: "38px" }} lineHeight={1.35} letterSpacing="0">
          AIは、店長の代わりではなく「下書き係」に。
        </Heading>
        <Text color="#536063" lineHeight={1.9}>
          今後は、集まった希望をもとにAIがシフトのたたき台を作る機能を追加予定です。最後は店長が見て直せる前提で、作業の最初の一歩を軽くします。
        </Text>
      </VStack>
      <Box bg="white" borderRadius="8px" borderWidth="1px" borderColor="#bfe5e9" p={5}>
        <HStack gap={3} mb={4}>
          <Flex boxSize="42px" borderRadius="12px" bg="#d8eff4" color="#177f98" align="center" justify="center">
            <LuSparkles />
          </Flex>
          <Box>
            <Text fontWeight="bold">AI下書き</Text>
            <Text fontSize="13px" color="#536063">
              開発予定
            </Text>
          </Box>
        </HStack>
        <VStack align="stretch" gap={3}>
          {["希望提出を読み込み", "不足しそうな日を確認", "まずは仮のシフトを作成"].map((item) => (
            <HStack key={item} color="#536063">
              <LuCheck color="#177f98" />
              <Text fontSize="14px">{item}</Text>
            </HStack>
          ))}
        </VStack>
      </Box>
    </Box>
  </Box>
);

const CatalogTrust = () => (
  <Box as="section" px={{ base: 5, lg: 8 }} py={{ base: 14, lg: 20 }} bg="white">
    <SimpleGrid columns={{ base: 1, lg: 3 }} gap={4} maxW="1040px" mx="auto">
      {[
        { title: "要望を受けながら改善", body: "小さなお店で迷わず使えるよう、必要な機能から育てています。" },
        { title: "スタッフ負担を増やさない", body: "アプリ導入やアカウント作成を前提にしない設計です。" },
        { title: "規約とデータ削除を明示", body: "安心して試せるよう、データの扱いをわかりやすくします。" },
      ].map((item) => (
        <Box key={item.title} borderWidth="1px" borderColor="#d8e6e8" borderRadius="8px" p={6} bg="#fbfdfd">
          <Heading as="h3" fontSize="20px" lineHeight={1.45} mb={3} letterSpacing="0">
            {item.title}
          </Heading>
          <Text color="#536063" lineHeight={1.8}>
            {item.body}
          </Text>
        </Box>
      ))}
    </SimpleGrid>
  </Box>
);

const CatalogCta = () => (
  <Box as="section" px={{ base: 5, lg: 8 }} py={{ base: 16, lg: 24 }} textAlign="center">
    <VStack gap={6} maxW="720px" mx="auto">
      <Heading as="h2" fontSize={{ base: "30px", lg: "44px" }} lineHeight={1.35} letterSpacing="0">
        希望回収と転記の時間を、次のシフトから軽く。
      </Heading>
      <Stack direction={{ base: "column", sm: "row" }} gap={4}>
        <Button h="56px" px={8} bg="#177f98" color="white" fontWeight="bold" _hover={{ bg: "#126b80" }}>
          さっそく使ってみる
          <LuArrowRight />
        </Button>
        <Button h="56px" px={8} variant="outline" color="#177f98" borderColor="#9bd8df" fontWeight="bold">
          デモを見る
        </Button>
      </Stack>
    </VStack>
  </Box>
);

const CatalogKicker = ({ children }: { children: string }) => (
  <Text
    display="inline-flex"
    color="#177f98"
    bg="#d8eff4"
    borderRadius="full"
    px={4}
    py={1.5}
    fontSize="13px"
    fontWeight="bold"
  >
    {children}
  </Text>
);

const ProductHeroPanel = () => (
  <Box
    bg="white"
    borderWidth="1px"
    borderColor="#d8e6e8"
    borderRadius="12px"
    p={{ base: 4, lg: 5 }}
    boxShadow="0 20px 50px rgba(31, 154, 184, 0.16)"
  >
    <SchedulePreview />
  </Box>
);

const SchedulePreview = () => (
  <Box minH={{ base: "300px", lg: "360px" }}>
    <HStack justify="space-between" mb={5}>
      <Box>
        <Text fontSize="13px" color="#536063" fontWeight="bold">
          カフェ シフトリ
        </Text>
        <Text fontSize="20px" fontWeight="bold">
          5月前半のシフト
        </Text>
      </Box>
      <HStack gap={2} color="#177f98" fontWeight="bold" fontSize="14px">
        <LuCalendarCheck />
        <Text>提出 7/7</Text>
      </HStack>
    </HStack>
    <VStack align="stretch" gap={3}>
      {[
        { name: "田中", start: "6%", width: "44%" },
        { name: "佐藤", start: "24%", width: "52%" },
        { name: "山田", start: "14%", width: "34%" },
        { name: "鈴木", start: "42%", width: "38%" },
        { name: "高橋", start: "8%", width: "58%" },
      ].map((row) => (
        <Box key={row.name} display="grid" gridTemplateColumns="64px 1fr" alignItems="center" gap={3}>
          <Text fontSize="13px" fontWeight="bold">
            {row.name}
          </Text>
          <Box h="30px" bg="#eef3f2" borderRadius="6px" position="relative" overflow="hidden">
            <Box
              position="absolute"
              top="5px"
              bottom="5px"
              left={row.start}
              w={row.width}
              bg="#177f98"
              borderRadius="5px"
            />
          </Box>
        </Box>
      ))}
    </VStack>
    <SimpleGrid columns={3} gap={3} mt={6}>
      {[
        ["未提出", "0人"],
        ["手直し", "3件"],
        ["通知", "準備OK"],
      ].map(([label, value]) => (
        <Box key={label} bg="#f5fbfc" borderRadius="8px" p={3}>
          <Text fontSize="12px" color="#536063">
            {label}
          </Text>
          <Text fontWeight="bold">{value}</Text>
        </Box>
      ))}
    </SimpleGrid>
  </Box>
);

const PhonePreview = () => (
  <Box
    position="absolute"
    right={{ base: "16px", md: "-22px" }}
    bottom={{ base: "0", md: "-24px" }}
    w={{ base: "166px", md: "190px" }}
    bg="white"
    borderWidth="2px"
    borderColor="#1f292b"
    borderRadius="28px"
    p={3}
    boxShadow="0 18px 36px rgba(31, 41, 43, 0.18)"
  >
    <VStack align="stretch" gap={3}>
      <Text fontSize="13px" fontWeight="bold">
        希望を提出
      </Text>
      {["5/12 月", "5/13 火", "5/14 水"].map((day, index) => (
        <HStack
          key={day}
          justify="space-between"
          bg={index === 1 ? "#d8eff4" : "#f4f7f7"}
          borderRadius="8px"
          px={3}
          py={2}
        >
          <Text fontSize="12px" fontWeight="bold">
            {day}
          </Text>
          <LuCheck color="#177f98" />
        </HStack>
      ))}
      <Button size="sm" bg="#177f98" color="white" _hover={{ bg: "#126b80" }}>
        提出する
      </Button>
    </VStack>
  </Box>
);

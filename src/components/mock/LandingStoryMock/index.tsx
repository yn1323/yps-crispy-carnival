import { Box, Flex, Heading, HStack, Image, SimpleGrid, Stack, Text, VStack } from "@chakra-ui/react";
import { LuArrowRight, LuCheck, LuCirclePlay, LuMessageCircle, LuSend, LuTable2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import heroIllustration from "../assets/hero-store-manager.svg";
import problemIllustration from "../assets/problem-excel-line.svg";
import staffSubmitIllustration from "../assets/staff-submit.svg";

const storySteps = [
  {
    title: "LINEや口頭で希望が集まる",
    body: "バラバラに届く希望を、あとから見返して整理する時間がかかります。",
  },
  {
    title: "スタッフはリンクから提出",
    body: "アプリのインストールやアカウント作成なしで、スマホから希望を入力できます。",
  },
  {
    title: "店長は表で手直し",
    body: "集まった希望を見ながら、いつもの感覚でシフトを調整できます。",
  },
];

export const LandingStoryMock = () => (
  <Box bg="#fffdfa" color="#2a211d" minH="100vh">
    <StoryNav />
    <Box as="main">
      <StoryHero />
      <StoryProblem />
      <StoryFlow />
      <StoryTrust />
      <StoryCta />
    </Box>
  </Box>
);

const StoryNav = () => (
  <Flex as="header" align="center" justify="space-between" maxW="1120px" mx="auto" px={{ base: 5, lg: 8 }} py={5}>
    <HStack gap={3}>
      <Flex boxSize="34px" borderRadius="full" bg="#d8eff4" align="center" justify="center" fontWeight="bold">
        シ
      </Flex>
      <Text fontWeight="bold" fontSize="18px">
        シフトリ
      </Text>
    </HStack>
    <HStack gap={3} display={{ base: "none", sm: "flex" }}>
      <Button variant="ghost" color="#2a211d">
        デモを見る
      </Button>
      <Button bg="#1f9ab8" color="white" _hover={{ bg: "#177f98" }}>
        さっそく使ってみる
      </Button>
    </HStack>
  </Flex>
);

const StoryHero = () => (
  <Box as="section" px={{ base: 5, lg: 8 }} pt={{ base: 8, lg: 16 }} pb={{ base: 14, lg: 24 }}>
    <SimpleGrid columns={{ base: 1, lg: 2 }} gap={{ base: 10, lg: 16 }} alignItems="center" maxW="1120px" mx="auto">
      <VStack align="start" gap={7}>
        <HStack borderWidth="2px" borderColor="#2a211d" borderRadius="full" px={4} py={2} bg="white">
          <Box boxSize="8px" borderRadius="full" bg="#1f9ab8" />
          <Text fontSize="14px" fontWeight="bold">
            少人数のお店のシフト管理
          </Text>
        </HStack>
        <Heading as="h1" fontSize={{ base: "40px", md: "56px", lg: "64px" }} lineHeight={1.18} letterSpacing="0">
          LINEで集めて、
          <Box as="span" display="block">
            Excelに転記。
          </Box>
          <Box as="span" display="block" color="#177f98">
            そんなシフト作成を、もっとラクに。
          </Box>
        </Heading>
        <Text fontSize={{ base: "16px", lg: "18px" }} lineHeight={1.9} color="#514640" maxW="560px">
          スタッフはアプリ不要。LINEやメールで届くリンクから希望を提出し、店長は集まった希望を見ながらシフト表を手直しできます。
        </Text>
        <Stack direction={{ base: "column", sm: "row" }} gap={4} w={{ base: "full", sm: "auto" }}>
          <Button h="56px" px={8} bg="#1f9ab8" color="white" fontWeight="bold" _hover={{ bg: "#177f98" }}>
            さっそく使ってみる
            <LuArrowRight />
          </Button>
          <Button h="56px" px={8} variant="outline" borderColor="#2a211d" color="#2a211d" fontWeight="bold">
            <LuCirclePlay />
            デモを見る
          </Button>
        </Stack>
      </VStack>
      <Box bg="white" borderWidth="2px" borderColor="#2a211d" borderRadius="24px" p={{ base: 3, lg: 5 }}>
        <Image src={heroIllustration} alt="店長がシフト表を確認しているイラスト" w="full" />
      </Box>
    </SimpleGrid>
  </Box>
);

const StoryProblem = () => (
  <Box as="section" bg="#f4fbfb" px={{ base: 5, lg: 8 }} py={{ base: 14, lg: 22 }}>
    <SimpleGrid columns={{ base: 1, lg: 2 }} gap={{ base: 10, lg: 14 }} alignItems="center" maxW="1120px" mx="auto">
      <Box order={{ base: 2, lg: 1 }}>
        <Image src={problemIllustration} alt="LINEとExcelを見比べて困る店長のイラスト" w="full" />
      </Box>
      <VStack align="start" gap={5} order={{ base: 1, lg: 2 }}>
        <SectionKicker>Scene 01</SectionKicker>
        <Heading as="h2" fontSize={{ base: "30px", lg: "44px" }} lineHeight={1.35} letterSpacing="0">
          シフト作成、こんな流れになっていませんか？
        </Heading>
        <VStack align="stretch" gap={3} w="full">
          {["LINEをさかのぼって希望を探す", "Excelに1人ずつ転記する", "完成後にまたスタッフへ連絡する"].map((item) => (
            <HStack key={item} bg="white" borderRadius="12px" borderWidth="1px" borderColor="#c9e8ec" px={4} py={3}>
              <LuCheck color="#1f9ab8" />
              <Text fontWeight="bold">{item}</Text>
            </HStack>
          ))}
        </VStack>
      </VStack>
    </SimpleGrid>
  </Box>
);

const StoryFlow = () => (
  <Box as="section" px={{ base: 5, lg: 8 }} py={{ base: 14, lg: 22 }}>
    <VStack gap={5} maxW="760px" mx="auto" textAlign="center" mb={{ base: 10, lg: 14 }}>
      <SectionKicker>Scene 02</SectionKicker>
      <Heading as="h2" fontSize={{ base: "30px", lg: "44px" }} lineHeight={1.35} letterSpacing="0">
        希望回収から手直しまで、ひとつの流れに。
      </Heading>
    </VStack>
    <SimpleGrid columns={{ base: 1, lg: 3 }} gap={5} maxW="1120px" mx="auto">
      {storySteps.map((step, index) => (
        <Box key={step.title} bg="white" borderWidth="2px" borderColor="#2a211d" borderRadius="18px" p={6}>
          <Text fontSize="13px" fontWeight="bold" color="#177f98" mb={4}>
            STEP {index + 1}
          </Text>
          <Heading as="h3" fontSize="22px" lineHeight={1.45} mb={3} letterSpacing="0">
            {step.title}
          </Heading>
          <Text color="#514640" lineHeight={1.8}>
            {step.body}
          </Text>
        </Box>
      ))}
    </SimpleGrid>
    <SimpleGrid
      columns={{ base: 1, lg: 2 }}
      gap={{ base: 8, lg: 12 }}
      alignItems="center"
      maxW="1040px"
      mx="auto"
      mt={12}
    >
      <Image src={staffSubmitIllustration} alt="スタッフがスマホで希望を提出するイラスト" w="full" />
      <ShiftBoardSketch />
    </SimpleGrid>
  </Box>
);

const StoryTrust = () => (
  <Box as="section" bg="#f8f6f1" px={{ base: 5, lg: 8 }} py={{ base: 14, lg: 20 }}>
    <SimpleGrid columns={{ base: 1, lg: 2 }} gap={8} maxW="1040px" mx="auto" alignItems="center">
      <VStack align="start" gap={4}>
        <SectionKicker>Trust</SectionKicker>
        <Heading as="h2" fontSize={{ base: "28px", lg: "40px" }} lineHeight={1.35} letterSpacing="0">
          要望を受けながら改善しています
        </Heading>
        <Text color="#514640" lineHeight={1.9}>
          シフトリは、小さなお店のシフト作成をラクにするための個人開発サービスです。大きな業務システムではなく、毎月の回収・転記・連絡を少しずつ軽くする体験を育てています。
        </Text>
      </VStack>
      <Box bg="white" borderWidth="2px" borderColor="#2a211d" borderRadius="18px" p={6}>
        <VStack align="stretch" gap={4}>
          {["LINE連携を追加", "スタッフ提出画面を改善", "AI下書き機能を検討中"].map((item) => (
            <HStack key={item} justify="space-between" borderBottomWidth="1px" borderColor="#eadfd5" pb={3}>
              <Text fontWeight="bold">{item}</Text>
              <Text fontSize="13px" color="#177f98" fontWeight="bold">
                改善中
              </Text>
            </HStack>
          ))}
        </VStack>
      </Box>
    </SimpleGrid>
  </Box>
);

const StoryCta = () => (
  <Box as="section" px={{ base: 5, lg: 8 }} py={{ base: 16, lg: 24 }} textAlign="center">
    <VStack gap={6} maxW="720px" mx="auto">
      <Heading as="h2" fontSize={{ base: "30px", lg: "44px" }} lineHeight={1.35} letterSpacing="0">
        次のシフト作成から、少しラクに。
      </Heading>
      <Stack direction={{ base: "column", sm: "row" }} gap={4}>
        <Button h="56px" px={8} bg="#1f9ab8" color="white" fontWeight="bold" _hover={{ bg: "#177f98" }}>
          さっそく使ってみる
          <LuArrowRight />
        </Button>
        <Button h="56px" px={8} variant="outline" borderColor="#2a211d" color="#2a211d" fontWeight="bold">
          デモを見る
        </Button>
      </Stack>
    </VStack>
  </Box>
);

const SectionKicker = ({ children }: { children: string }) => (
  <Text
    display="inline-flex"
    borderWidth="2px"
    borderColor="#2a211d"
    borderRadius="full"
    px={4}
    py={1.5}
    fontSize="13px"
    fontWeight="bold"
    bg="white"
    color="#177f98"
  >
    {children}
  </Text>
);

const ShiftBoardSketch = () => (
  <Box bg="white" borderWidth="2px" borderColor="#2a211d" borderRadius="20px" p={5}>
    <HStack justify="space-between" mb={5}>
      <Text fontWeight="bold">5月前半のシフト</Text>
      <HStack color="#177f98" fontWeight="bold" fontSize="13px">
        <LuMessageCircle />
        <Text>提出 7/7人</Text>
      </HStack>
    </HStack>
    <VStack align="stretch" gap={3}>
      {[
        { name: "田中", width: "52%", icon: LuSend },
        { name: "佐藤", width: "68%", icon: LuTable2 },
        { name: "山田", width: "44%", icon: LuSend },
      ].map(({ name, width, icon: Icon }) => (
        <Box key={name} display="grid" gridTemplateColumns="56px 1fr 28px" gap={3} alignItems="center">
          <Text fontSize="14px" fontWeight="bold">
            {name}
          </Text>
          <Box h="24px" bg="#eef3f2" borderRadius="6px" overflow="hidden">
            <Box h="full" w={width} bg="#1f9ab8" borderRadius="6px" />
          </Box>
          <Icon color="#1f9ab8" />
        </Box>
      ))}
    </VStack>
  </Box>
);

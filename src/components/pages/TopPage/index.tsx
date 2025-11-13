import {
  Box,
  Button,
  Container,
  Flex,
  Grid,
  GridItem,
  HStack,
  Icon,
  Link,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useState } from "react";
import { AiOutlineCalendar, AiOutlineClockCircle, AiOutlineDollarCircle } from "react-icons/ai";
import { BiChevronLeft, BiChevronRight, BiMessageSquareDetail } from "react-icons/bi";
import { HiMenu, HiOutlineUsers } from "react-icons/hi";
import { IoMapOutline } from "react-icons/io5";
import { MdArrowForward, MdBarChart } from "react-icons/md";
import { resetUserAtom } from "@/src/stores/user";


  const navItems = [
    { name: "機能", href: "#features" },
    { name: "料金", href: "#pricing" },
    { name: "ターゲット", href: "#target" },
  ];

  const problems = [
    {
      icon: BiMessageSquareDetail,
      title: "LINE・Excelで非効率",
      description: "メッセージが流れる、変更のたびに再共有が必要",
    },
    {
      icon: AiOutlineDollarCircle,
      title: "既存ツールは高額",
      description: "小規模店舗にはコストが見合わない",
    },
  ];

  const features = [
    {
      icon: AiOutlineCalendar,
      title: "シフト管理",
      description: "申請、承認、確定まで一気通貫。週1回・2週間・1ヶ月のサイクル選択可能。",
      highlight: true,
    },
    {
      icon: AiOutlineClockCircle,
      title: "タイムカード",
      description: "スマホ・PCから出退勤を打刻。GPS機能で不正打刻を防止。",
      highlight: false,
    },
    {
      icon: MdBarChart,
      title: "勤怠集計",
      description: "労働時間を自動集計。CSV出力で給与計算ソフトと連携。",
      highlight: false,
    },
    {
      icon: HiOutlineUsers,
      title: "メンバー管理",
      description: "オーナー・マネージャー・スタッフの3役割。複数店舗も対応。",
      highlight: false,
    },
  ];

  const footerLinks = {
    product: {
      title: "プロダクト",
      links: ["機能", "料金", "デモ", "ロードマップ"],
    },
    company: {
      title: "会社",
      links: ["会社概要", "お問い合わせ", "ブログ"],
    },
    legal: {
      title: "法的事項",
      links: ["利用規約", "プライバシーポリシー", "特定商取引法"],
    },
    support: {
      title: "サポート",
      links: ["ヘルプセンター", "よくある質問", "お問い合わせ"],
    },
  };

  const weeks = [
    [
      { date: 4, day: "月", shift: null },
      { date: 5, day: "火", shift: "10:00-18:00" },
      { date: 6, day: "水", shift: null },
      { date: 7, day: "木", shift: "14:00-22:00" },
      { date: 8, day: "金", shift: "10:00-18:00" },
      { date: 9, day: "土", shift: "09:00-17:00" },
      { date: 10, day: "日", shift: null },
    ],
    [
      { date: 11, day: "月", shift: "10:00-18:00" },
      { date: 12, day: "火", shift: null },
      { date: 13, day: "水", shift: "14:00-22:00" },
      { date: 14, day: "木", shift: "10:00-18:00" },
      { date: 15, day: "金", shift: null },
      { date: 16, day: "土", shift: "09:00-17:00" },
      { date: 17, day: "日", shift: "12:00-20:00" },
    ],
  ];

export const TopPage = () => {
  resetUserAtom();

  const [isMenuOpen, setIsMenuOpen] = useState(false);


  return (
    <Box minH="100vh" bg="white">
      {/* Header */}
      <Box
        as="header"
        position="sticky"
        top="0"
        zIndex="50"
        w="full"
        borderBottom="1px"
        borderColor="gray.200"
        bg="white"
        backdropFilter="blur(10px)"
      >
        <Container maxW="7xl">
          <Flex h="16" align="center" justify="space-between">
            {/* Logo */}
            <HStack gap="2">
              <Flex w="8" h="8" bg="teal.600" borderRadius="lg" align="center" justify="center">
                <Icon as={AiOutlineCalendar} boxSize="5" color="white" />
              </Flex>
              <Text color="gray.900">ShiftHub</Text>
            </HStack>

            {/* Desktop Navigation */}
            <HStack gap="6" display={{ base: "none", md: "flex" }}>
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  fontSize="sm"
                  color="gray.600"
                  _hover={{ color: "gray.900" }}
                  transition="colors 0.15s"
                >
                  {item.name}
                </Link>
              ))}
            </HStack>

            {/* Right side - Login button */}
            <HStack gap="4">
              <Button variant="outline" display={{ base: "none", sm: "flex" }}>
                ログイン
              </Button>

              {/* Mobile menu button */}
              <Button
                display={{ base: "flex", md: "none" }}
                variant="ghost"
                p="2"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                <Icon as={HiMenu} boxSize="6" />
              </Button>
            </HStack>
          </Flex>

          {/* Mobile Navigation */}
          {isMenuOpen && (
            <Box display={{ base: "block", md: "none" }} py="4" borderTop="1px" borderColor="gray.200">
              <VStack gap="4" align="stretch">
                {navItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    fontSize="sm"
                    color="gray.600"
                    _hover={{ color: "gray.900" }}
                    transition="colors 0.15s"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}
                <Button variant="outline" w="full" display={{ base: "flex", sm: "none" }}>
                  ログイン
                </Button>
              </VStack>
            </Box>
          )}
        </Container>
      </Box>

      {/* Hero Section */}
      <Box
        as="section"
        position="relative"
        overflow="hidden"
        bgGradient="to-b"
        gradientFrom="teal.50"
        gradientTo="white"
      >
        <Container maxW="7xl" py={{ base: "16", sm: "24" }}>
          <Grid templateColumns={{ base: "1fr", lg: "repeat(2, 1fr)" }} gap="12" alignItems="center">
            <GridItem textAlign={{ base: "center", lg: "left" }}>
              <HStack
                display="inline-flex"
                gap="2"
                px="4"
                py="2"
                bg="teal.100"
                color="teal.700"
                borderRadius="full"
                mb="6"
              >
                <Icon as={AiOutlineClockCircle} boxSize="4" />
                <Text fontSize="sm">無料で始められるシフト管理</Text>
              </HStack>

              <Text fontSize={{ base: "3xl", md: "4xl", lg: "5xl" }} color="teal.900" mb="6" lineHeight="1.2">
                小規模店舗のための
                <br />
                シンプルなシフト管理
              </Text>

              <Text color="gray.600" mb="8" maxW="2xl" mx={{ base: "auto", lg: "0" }}>
                LINEやExcelから卒業。シフト申請・承認・勤怠管理を一つに。
              </Text>

              <Flex direction={{ base: "column", sm: "row" }} gap="4" justify={{ base: "center", lg: "flex-start" }}>
                <Button size="lg" colorPalette="teal">
                  無料で始める →
                </Button>
              </Flex>

              <Flex
                flexWrap="wrap"
                gap="6"
                justify={{ base: "center", lg: "flex-start" }}
                mt="12"
                fontSize="sm"
                color="gray.600"
              >
                <HStack gap="2">
                  <Icon as={HiOutlineUsers} boxSize="5" color="teal.600" />
                  <Text>10人まで無料</Text>
                </HStack>
                <HStack gap="2">
                  <Icon as={AiOutlineCalendar} boxSize="5" color="teal.600" />
                  <Text>簡単シフト管理</Text>
                </HStack>
                <HStack gap="2">
                  <Icon as={AiOutlineClockCircle} boxSize="5" color="teal.600" />
                  <Text>勤怠記録機能</Text>
                </HStack>
              </Flex>
            </GridItem>

            {/* Shift Mock */}
            <GridItem position="relative">
              <Box position="relative" bg="white" borderRadius="xl" boxShadow="2xl" overflow="hidden">
                {/* Shift Mock Header */}
                <Box bgGradient="to-r" gradientFrom="teal.600" gradientTo="teal.700" color="white" p="4">
                  <Flex align="center" justify="space-between">
                    <HStack gap="2">
                      <Icon as={AiOutlineCalendar} boxSize="5" />
                      <Text>マイシフト</Text>
                    </HStack>
                    <HStack gap="2">
                      <Button variant="ghost" size="xs" p="1" _hover={{ bg: "whiteAlpha.200" }}>
                        <Icon as={BiChevronLeft} boxSize="4" />
                      </Button>
                      <Text fontSize="sm">11月</Text>
                      <Button variant="ghost" size="xs" p="1" _hover={{ bg: "whiteAlpha.200" }}>
                        <Icon as={BiChevronRight} boxSize="4" />
                      </Button>
                    </HStack>
                  </Flex>
                </Box>

                {/* Shift Mock Content */}
                <Box p="4" bg="white">
                  <VStack gap="3">
                    {weeks.map((week, weekIndex) => (
                      <Grid key={weekIndex} templateColumns="repeat(7, 1fr)" gap="1" w="full">
                        {week.map((day, dayIndex) => (
                          <Box
                            key={dayIndex}
                            position="relative"
                            aspectRatio="1"
                            borderRadius="lg"
                            border="1px"
                            borderColor={day.shift ? "teal.200" : "gray.200"}
                            bg={day.shift ? "teal.50" : "white"}
                            _hover={{ bg: day.shift ? "teal.100" : "gray.50" }}
                            transition="all 0.15s"
                          >
                            <Box position="absolute" inset="0" p="1.5">
                              <Flex align="start" justify="space-between" gap="1">
                                <Text fontSize="xs" color={day.shift ? "teal.900" : "gray.400"}>
                                  {day.date}
                                </Text>
                                <Text fontSize="2xs" color={day.shift ? "teal.600" : "gray.400"}>
                                  {day.day}
                                </Text>
                              </Flex>
                              {day.shift && (
                                <Box mt="auto">
                                  <Text fontSize="2xs" color="teal.700" lineHeight="tight" wordBreak="break-word">
                                    {day.shift}
                                  </Text>
                                </Box>
                              )}
                            </Box>
                          </Box>
                        ))}
                      </Grid>
                    ))}
                  </VStack>

                  <Box mt="4" pt="4" borderTop="1px" borderColor="gray.100">
                    <Flex align="center" justify="space-between" fontSize="xs" color="gray.600">
                      <Text>今月の出勤: 9日</Text>
                      <Text>合計時間: 72時間</Text>
                    </Flex>
                  </Box>
                </Box>
              </Box>
            </GridItem>
          </Grid>
        </Container>
      </Box>

      {/* Problems Section */}
      <Box as="section" py={{ base: "12", sm: "16" }} bg="white">
        <Container maxW="7xl">
          <VStack gap="12">
            <Box textAlign="center">
              <Text fontSize={{ base: "2xl", md: "3xl" }} color="gray.900" mb="4">
                こんなお悩みありませんか？
              </Text>
            </Box>

            <SimpleGrid columns={{ base: 1, sm: 2 }} gap="6" maxW="3xl" mx="auto" w="full">
              {problems.map((problem, index) => (
                <Box
                  key={index}
                  textAlign="center"
                  p="6"
                  borderRadius="xl"
                  bg="gray.50"
                  _hover={{ bg: "gray.100" }}
                  transition="all 0.15s"
                >
                  <Flex
                    w="12"
                    h="12"
                    bg="red.100"
                    color="red.600"
                    borderRadius="lg"
                    align="center"
                    justify="center"
                    mx="auto"
                    mb="4"
                  >
                    <Icon as={problem.icon} boxSize="6" />
                  </Flex>
                  <Text color="gray.900" mb="2">
                    {problem.title}
                  </Text>
                  <Text fontSize="sm" color="gray.600">
                    {problem.description}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>
          </VStack>
        </Container>
      </Box>

      {/* Features Section */}
      <Box
        id="features"
        as="section"
        py={{ base: "12", sm: "16" }}
        bgGradient="to-b"
        gradientFrom="white"
        gradientTo="teal.50"
      >
        <Container maxW="7xl">
          <Box textAlign="center" mb="12">
            <Text fontSize={{ base: "2xl", md: "3xl" }} color="gray.900" mb="4">
              必要な機能を、すべて一つに
            </Text>
          </Box>

          <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} gap="6">
            {features.map((feature, index) => (
              <Box
                key={index}
                bg={feature.highlight ? "teal.600" : "white"}
                color={feature.highlight ? "white" : "gray.900"}
                borderRadius="xl"
                boxShadow="sm"
                _hover={{ boxShadow: "md" }}
                transition="all 0.15s"
                p="6"
              >
                <Flex
                  w="12"
                  h="12"
                  bg={feature.highlight ? "teal.500" : "teal.100"}
                  borderRadius="lg"
                  align="center"
                  justify="center"
                  mb="4"
                >
                  <Icon as={feature.icon} boxSize="6" color={feature.highlight ? "white" : "teal.600"} />
                </Flex>
                <Text mb="2" color={feature.highlight ? "white" : "gray.900"}>
                  {feature.title}
                </Text>
                <Text fontSize="sm" color={feature.highlight ? "teal.50" : "gray.600"}>
                  {feature.description}
                </Text>
              </Box>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      {/* Target Users Section */}
      <Box id="target" as="section" py={{ base: "12", sm: "16" }} bg="white">
        <Container maxW="7xl">
          <Grid templateColumns={{ base: "1fr", lg: "repeat(2, 1fr)" }} gap="12" alignItems="center">
            {/* Timecard Mock */}
            <GridItem order={{ base: 1, lg: 0 }}>
              <Box maxW="sm" mx="auto" bg="white" borderRadius="xl" boxShadow="xl" overflow="hidden">
                <Box bgGradient="to-br" gradientFrom="teal.50" gradientTo="cyan.50" p="6">
                  <VStack gap="6">
                    <HStack display="inline-flex" gap="2" px="3" py="1" bg="white" borderRadius="full" boxShadow="sm">
                      <Box w="2" h="2" bg="green.500" borderRadius="full" />
                      <Text fontSize="sm" color="gray.700">
                        出勤中
                      </Text>
                    </HStack>

                    <VStack gap="1">
                      <Text fontSize="4xl" color="gray.900">
                        14:23:45
                      </Text>
                      <Text fontSize="sm" color="gray.500">
                        2025年11月8日 (土)
                      </Text>
                    </VStack>

                    <Box bg="white" borderRadius="xl" p="4" boxShadow="sm" w="full">
                      <Flex align="center" justify="space-between" mb="3">
                        <Text fontSize="sm" color="gray.600">
                          本日の勤務時間
                        </Text>
                        <Text color="teal.600">4時間23分</Text>
                      </Flex>
                      <Grid templateColumns="repeat(2, 1fr)" gap="3" fontSize="sm">
                        <Box>
                          <Text fontSize="xs" color="gray.500" mb="1">
                            出勤
                          </Text>
                          <Text color="gray.900">10:00</Text>
                        </Box>
                        <Box>
                          <Text fontSize="xs" color="gray.500" mb="1">
                            退勤予定
                          </Text>
                          <Text color="gray.900">18:00</Text>
                        </Box>
                      </Grid>
                    </Box>

                    <Button w="full" colorPalette="teal" gap="2">
                      <Icon as={AiOutlineClockCircle} boxSize="4" />
                      退勤する
                    </Button>

                    <HStack gap="2" fontSize="xs" color="gray.500">
                      <Icon as={IoMapOutline} boxSize="3" />
                      <Text>店舗A 渋谷店</Text>
                    </HStack>
                  </VStack>
                </Box>

                <Box p="4" bg="white">
                  <Text fontSize="xs" color="gray.600" mb="2">
                    今週の勤務実績
                  </Text>
                  <VStack gap="2">
                    {["月", "火", "水", "木"].map((day, index) => (
                      <Flex key={index} align="center" justify="space-between" fontSize="xs" w="full">
                        <Text color="gray.500">{day}曜日</Text>
                        <Text color="gray.700">8時間</Text>
                      </Flex>
                    ))}
                  </VStack>
                  <Flex mt="3" pt="3" borderTop="1px" borderColor="gray.100" align="center" justify="space-between">
                    <Text fontSize="sm" color="gray.600">
                      週合計
                    </Text>
                    <Text color="teal.600">36時間23分</Text>
                  </Flex>
                </Box>
              </Box>
            </GridItem>

            <GridItem>
              <VStack gap="6" align="start">
                <Text fontSize={{ base: "2xl", md: "3xl" }} color="gray.900">
                  小規模店舗のために
                  <br />
                  設計されたツール
                </Text>

                <Text color="gray.600">
                  飲食店・小売業など、1店舗20人程度の小規模店舗に最適。
                  <br />
                  10人まで完全無料で使えます。
                </Text>

                <Box bg="teal.50" borderRadius="xl" p="6" border="1px" borderColor="teal.100" w="full">
                  <Text color="teal.900" mb="2">
                    オーナー・店長・スタッフで使える
                  </Text>
                  <Text fontSize="sm" color="gray.700">
                    それぞれの立場に合わせた画面と機能で、誰でも簡単に使えます。
                  </Text>
                </Box>
              </VStack>
            </GridItem>
          </Grid>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box
        as="section"
        py={{ base: "16", sm: "24" }}
        bgGradient="to-br"
        gradientFrom="teal.600"
        gradientTo="teal.700"
        position="relative"
        overflow="hidden"
      >
        <Box position="absolute" inset="0" opacity="0.2" />

        <Container maxW="4xl" position="relative" zIndex="10" textAlign="center">
          <VStack gap="6">
            <Text fontSize={{ base: "2xl", md: "3xl" }} color="white">
              今すぐシフト管理を
              <Box as="br" display={{ base: "block", sm: "none" }} />
              スムーズに
            </Text>

            <Text fontSize={{ base: "md", md: "lg" }} color="teal.50" maxW="2xl">
              煩雑なシフト管理から解放。無料プランで今すぐ始められます。
            </Text>

            <Flex direction={{ base: "column", sm: "row" }} gap="4" justify="center">
              <Button size="lg" variant="outline" colorPalette="teal" bg="white" gap="2">
                無料で始める
                <Icon as={MdArrowForward} boxSize="5" />
              </Button>
            </Flex>

            <Text fontSize="sm" color="teal.100" mt="8">
              10人まで永久無料 • いつでも解約可能
            </Text>
          </VStack>
        </Container>
      </Box>

      {/* Footer */}
      <Box as="footer" bg="gray.900" color="gray.300">
        <Container maxW="7xl" py={{ base: "12", sm: "16" }}>
          <Grid templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(5, 1fr)" }} gap="8" mb="12">
            <GridItem colSpan={{ base: 2, md: 1 }}>
              <VStack align="start" gap="4">
                <HStack gap="2">
                  <Flex w="8" h="8" bg="teal.600" borderRadius="lg" align="center" justify="center">
                    <Icon as={AiOutlineCalendar} boxSize="5" color="white" />
                  </Flex>
                  <Text color="white">ShiftHub</Text>
                </HStack>
                <Text fontSize="sm" color="gray.400">
                  小規模店舗のための
                  <br />
                  シンプルなシフト管理SaaS
                </Text>
              </VStack>
            </GridItem>

            {Object.entries(footerLinks).map(([key, section]) => (
              <GridItem key={key}>
                <VStack align="start" gap="4">
                  <Text color="white" fontSize="sm">
                    {section.title}
                  </Text>
                  <VStack align="start" gap="2">
                    {section.links.map((link, index) => (
                      <Link
                        key={index}
                        href="#"
                        fontSize="sm"
                        color="gray.400"
                        _hover={{ color: "white" }}
                        transition="colors 0.15s"
                      >
                        {link}
                      </Link>
                    ))}
                  </VStack>
                </VStack>
              </GridItem>
            ))}
          </Grid>

          <Flex
            pt="8"
            borderTop="1px"
            borderColor="gray.800"
            direction={{ base: "column", sm: "row" }}
            justify="space-between"
            align="center"
            gap="4"
          >
            <Text fontSize="sm" color="gray.400">
              © 2025 ShiftHub. All rights reserved.
            </Text>
            <HStack gap="6">
              <Link href="#" fontSize="sm" color="gray.400" _hover={{ color: "white" }} transition="colors 0.15s">
                Twitter
              </Link>
              <Link href="#" fontSize="sm" color="gray.400" _hover={{ color: "white" }} transition="colors 0.15s">
                Facebook
              </Link>
              <Link href="#" fontSize="sm" color="gray.400" _hover={{ color: "white" }} transition="colors 0.15s">
                Instagram
              </Link>
            </HStack>
          </Flex>
        </Container>
      </Box>
    </Box>
  );
};

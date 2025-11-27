import { Box, Button, Container, Flex, Grid, GridItem, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { AiOutlineCalendar, AiOutlineClockCircle } from "react-icons/ai";
import { HiOutlineUsers } from "react-icons/hi";

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

export const HeroSection = () => {
  return (
    <Box as="section" position="relative" overflow="hidden" bgGradient="to-b" gradientFrom="teal.50" gradientTo="white">
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
                    <Text fontSize="sm">11月</Text>
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
  );
};

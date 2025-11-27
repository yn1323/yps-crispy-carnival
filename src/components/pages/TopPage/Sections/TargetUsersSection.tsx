import { Box, Button, Container, Flex, Grid, GridItem, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { AiOutlineClockCircle } from "react-icons/ai";
import { IoMapOutline } from "react-icons/io5";

export const TargetUsersSection = () => {
  return (
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
  );
};

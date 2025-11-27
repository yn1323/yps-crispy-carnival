import { Box, Container, Flex, Icon, SimpleGrid, Text } from "@chakra-ui/react";
import { AiOutlineCalendar, AiOutlineClockCircle } from "react-icons/ai";
import { HiOutlineUsers } from "react-icons/hi";
import { MdBarChart } from "react-icons/md";

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

export const FeaturesSection = () => {
  return (
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
  );
};

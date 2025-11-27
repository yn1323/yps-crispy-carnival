import { Box, Container, Flex, Icon, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { AiOutlineDollarCircle } from "react-icons/ai";
import { BiMessageSquareDetail } from "react-icons/bi";

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

export const ProblemsSection = () => {
  return (
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
              <Box key={index} textAlign="center" p="6" borderRadius="xl" bg="gray.50" transition="all 0.15s">
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
  );
};

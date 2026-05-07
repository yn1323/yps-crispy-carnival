import { Box, Container, Flex, Heading, Icon, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import {
  LuArrowRight,
  LuBell,
  LuCalendarCheck,
  LuClipboardCheck,
  LuFileSpreadsheet,
  LuMegaphone,
  LuMessageCircle,
} from "react-icons/lu";

const problemCards = [
  { number: "01", title: "希望を集める", icon: LuMessageCircle },
  { number: "02", title: "未提出を確認する", icon: LuClipboardCheck },
  { number: "03", title: "Excelに転記する", icon: LuFileSpreadsheet },
  { number: "04", title: "変更を共有する", icon: LuMegaphone },
];

const solutionSteps = [
  { icon: LuMessageCircle, title: "集める", body: "LINEから希望をかんたん提出" },
  { icon: LuCalendarCheck, title: "作る", body: "希望を反映してシフト表を作成" },
  { icon: LuBell, title: "共有する", body: "確定シフトをワンクリックで通知" },
];

export const ProblemSection = () => (
  <Box as="section" bg="gray.50" py={{ base: 16, md: 24 }}>
    <Container maxW="7xl">
      <VStack gap={{ base: 10, md: 14 }}>
        <VStack gap={5} textAlign="center">
          <Heading as="h2" color="gray.950" fontSize={{ base: "3xl", md: "5xl" }} lineHeight="1.25">
            シフト作成って、
            <Box as="span" color="teal.700">
              地味にやることが多い。
            </Box>
          </Heading>
          <Box w="56px" h="6px" bg="teal.600" borderRadius="full" />
          <Text color="gray.700" fontSize={{ base: "md", md: "lg" }} lineHeight="1.8">
            希望を集めるだけでも、確認・転記・共有まで意外と手間がかかります。
          </Text>
        </VStack>

        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={{ base: 5, md: 7 }} w="full">
          {problemCards.map((card) => (
            <ProblemCard key={card.number} {...card} />
          ))}
        </SimpleGrid>

        <Box
          w="full"
          overflow="hidden"
          bg="teal.50"
          borderRadius={{ base: "2xl", md: "3xl" }}
          px={{ base: 6, md: 12 }}
          py={{ base: 8, md: 10 }}
        >
          <SimpleGrid columns={{ base: 1, lg: 2 }} gap={{ base: 8, lg: 10 }} alignItems="center">
            <VStack align={{ base: "center", lg: "start" }} gap={3} textAlign={{ base: "center", lg: "left" }}>
              <Text color="gray.950" fontSize={{ base: "lg", md: "2xl" }} fontWeight="bold">
                シフトリなら、
              </Text>
              <Heading as="h3" color="gray.950" fontSize={{ base: "2xl", md: "4xl" }} lineHeight="1.35">
                <Box as="span" color="teal.700">
                  集める・作る・共有する
                </Box>
                までを
              </Heading>
              <Text color="gray.950" fontSize={{ base: "md", md: "xl" }} fontWeight="bold" lineHeight="1.8">
                ひとつにまとめて、シフト作成を
                <Box as="span" color="teal.700">
                  もっとラクに。
                </Box>
              </Text>
            </VStack>

            <Flex align="stretch" justify="center" direction={{ base: "column", md: "row" }} gap={{ base: 4, md: 5 }}>
              {solutionSteps.map((step, index) => (
                <SolutionStep key={step.title} {...step} showArrow={index < solutionSteps.length - 1} />
              ))}
            </Flex>
          </SimpleGrid>
        </Box>
      </VStack>
    </Container>
  </Box>
);

const ProblemCard = ({ number, title, icon }: { number: string; title: string; icon: IconType }) => (
  <Box
    bg="white"
    borderRadius="2xl"
    px={{ base: 6, md: 8 }}
    py={{ base: 7, md: 8 }}
    boxShadow="0 14px 34px rgba(15, 23, 42, 0.08)"
  >
    <Flex align="center" gap={5}>
      <Flex
        align="center"
        justify="center"
        flex="0 0 auto"
        boxSize={{ base: 12, md: 14 }}
        bg="teal.500"
        color="white"
        borderRadius="full"
        fontSize={{ base: "lg", md: "xl" }}
        fontWeight="bold"
      >
        {number}
      </Flex>
      <Heading as="h3" color="gray.950" fontSize={{ base: "xl", md: "xl" }} lineHeight="1.4">
        {title}
      </Heading>
    </Flex>

    <Flex
      aria-hidden="true"
      align="center"
      justify="center"
      h={{ base: "180px", md: "220px" }}
      mt={{ base: 6, md: 8 }}
      color="teal.600"
      borderRadius="xl"
      bg="linear-gradient(135deg, rgba(204, 251, 241, 0.45), rgba(255, 255, 255, 0.9))"
    >
      <Icon as={icon} boxSize={{ base: 16, md: 20 }} opacity={0.18} />
    </Flex>
  </Box>
);

const SolutionStep = ({
  icon,
  title,
  body,
  showArrow,
}: {
  icon: IconType;
  title: string;
  body: string;
  showArrow: boolean;
}) => (
  <Flex align="center" gap={{ base: 4, md: 5 }}>
    <VStack gap={3} minW={{ base: "auto", md: "120px" }} textAlign="center">
      <Flex
        align="center"
        justify="center"
        boxSize={{ base: 16, md: 20 }}
        bg="white"
        color="teal.700"
        borderRadius="full"
      >
        <Icon as={icon} boxSize={{ base: 8, md: 10 }} />
      </Flex>
      <VStack gap={1}>
        <Text color="teal.700" fontSize={{ base: "lg", md: "xl" }} fontWeight="bold">
          {title}
        </Text>
        <Text color="gray.950" fontSize="sm" fontWeight="bold" lineHeight="1.6">
          {body}
        </Text>
      </VStack>
    </VStack>
    {showArrow && <Icon as={LuArrowRight} display={{ base: "none", md: "block" }} color="teal.600" boxSize={7} />}
  </Flex>
);

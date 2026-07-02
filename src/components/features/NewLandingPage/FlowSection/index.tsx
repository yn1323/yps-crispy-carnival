import { Box, Container, Flex, Heading, Icon, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuBell, LuChevronDown, LuChevronRight, LuLaptop, LuMailCheck, LuSmartphone } from "react-icons/lu";

const flowSteps: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuSmartphone,
    title: "集める",
    body: "提出リンクをLINE・メールで送る",
  },
  {
    icon: LuBell,
    title: "催促する",
    body: "未提出者へ自動でリマインド",
  },
  {
    icon: LuLaptop,
    title: "調整する",
    body: "集まった希望を見ながらシフトを組む",
  },
  {
    icon: LuMailCheck,
    title: "共有する",
    body: "確定シフトを自動でお知らせ",
  },
];

export const FlowSection = () => (
  <Box as="section" bg="white" py={14}>
    <Container maxW="7xl">
      <VStack gap={10}>
        <Heading as="h2" fontSize={{ base: "2xl", md: "3xl" }} lineHeight="1.5" letterSpacing="0" textAlign="center">
          <Box as="span" display="inline-block">
            毎月のシフト作成が、
          </Box>
          <Box as="span" display="inline-block">
            この4ステップで終わります。
          </Box>
        </Heading>

        <SimpleGrid columns={{ base: 1, md: 4 }} gap={{ base: 5, md: 0 }} w="full">
          {flowSteps.map((step, index) => (
            <FlowStep key={step.title} number={index + 1} isLast={index === flowSteps.length - 1} {...step} />
          ))}
        </SimpleGrid>
      </VStack>
    </Container>
  </Box>
);

const FlowStep = ({
  number,
  icon,
  title,
  body,
  isLast,
}: {
  number: number;
  icon: IconType;
  title: string;
  body: string;
  isLast: boolean;
}) => (
  <Flex position="relative" direction="column" align="center" gap={4} px={6} textAlign="center">
    <Flex align="center" justify="center" boxSize={20} color="teal.600">
      <Icon as={icon} boxSize={14} strokeWidth={1.7} />
    </Flex>

    {!isLast && (
      <Icon
        as={LuChevronRight}
        position="absolute"
        top="30px"
        insetInlineEnd="-18px"
        hideBelow="md"
        boxSize={9}
        color="teal.400"
      />
    )}

    <Box>
      <Text color="gray.950" fontSize="lg" fontWeight="black" lineHeight="1.4">
        {number}. {title}
      </Text>
      <Text mt={2} color="gray.700" fontSize="sm" lineHeight="1.75" fontWeight="semibold">
        {body}
      </Text>
    </Box>

    {!isLast && <Icon as={LuChevronDown} hideFrom="md" boxSize={8} mt={1} color="teal.400" />}
  </Flex>
);

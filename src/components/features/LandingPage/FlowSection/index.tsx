import { Box, Container, Flex, Icon, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { SectionHeading } from "../SectionHeading";
import buildShiftImage from "./build-shift.webp";
import confirmShiftImage from "./confirm-shift.webp";
import setCollectionPeriodImage from "./set-collection-period.webp";

const flowSteps: Array<{ imageSrc: string; title: string; body: string }> = [
  {
    imageSrc: setCollectionPeriodImage,
    title: "シフト募集期間を決める",
    body: "指定して期間の提出リンクをLINE・メールで自動送信",
  },
  {
    imageSrc: buildShiftImage,
    title: "シフトを組む",
    body: "集まった希望を見ながらシフトを組む",
  },
  {
    imageSrc: confirmShiftImage,
    title: "シフトを確定する",
    body: "確定シフトを自動でお知らせ",
  },
];

export const FlowSection = () => (
  <Box as="section" bg="white" py={14}>
    <Container maxW="7xl">
      <VStack gap={10}>
        <SectionHeading phrases={["毎月のシフト作成が3ステップで完了！"]} textAlign="center" />

        <SimpleGrid columns={{ base: 1, md: 3 }} gap={{ base: 3, md: 0 }} w="full">
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
  imageSrc,
  title,
  body,
  isLast,
}: {
  number: number;
  imageSrc: string;
  title: string;
  body: string;
  isLast: boolean;
}) => (
  <Flex position="relative" direction="column" align="center" gap={4} px={6} textAlign="center">
    <Flex align="center" justify="center" boxSize={{ base: "148px", md: "172px" }}>
      <Image src={imageSrc} alt="" w="full" h="full" objectFit="contain" loading="lazy" />
    </Flex>

    {!isLast && (
      <Icon
        as={LuChevronRight}
        position="absolute"
        top="68px"
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

    {!isLast && <Icon as={LuChevronDown} hideFrom="md" boxSize={8} mt={1} color="teal.600" />}
  </Flex>
);

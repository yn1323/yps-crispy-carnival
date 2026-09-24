import { Box, Container, Flex, Heading, Icon, Image, SimpleGrid, Stack, Text, VStack } from "@chakra-ui/react";
import { LuCheck, LuZap } from "react-icons/lu";
import confirmedShiftNoticeImage from "@/src/assets/screens/confirmed-shift-notice.webp";
import shiftBoardSpImage from "@/src/assets/screens/shift-board-sp.webp";
import staffRequestNoticeImage from "@/src/assets/screens/staff-request-notice.webp";
import { LANDING_HEADER_SCROLL_MARGIN_TOP } from "../constants";
import { SectionHeading } from "../SectionHeading";

type Step = {
  title: string;
  body: string;
  automations: string[];
  imageSrc: string;
  imageAlt: string;
};

// 担当者の操作と、シフトリが代わりに行う連絡を分けて見せる。
const steps: Step[] = [
  {
    title: "シフトを募集する",
    body: "シフト期間と提出期限を決めて、シフト募集を作ります。",
    automations: ["スタッフのLINEやメールに提出リンクが届く", "提出期限の前日に未提出の人へ催促が届く"],
    imageSrc: staffRequestNoticeImage,
    imageAlt: "スタッフのスマートフォンに届いた、希望シフトの提出のお願い",
  },
  {
    title: "シフトを組む",
    body: "集まった希望シフトを見ながら勤務を割り当てます。PCでもスマホでも操作できます。",
    automations: ["提出された希望シフトがシフト表に並ぶ", "休業日への割り当てなどを保存前にチェック"],
    imageSrc: shiftBoardSpImage,
    imageAlt: "スマートフォンのシフト表で、1日分のスタッフの勤務を割り当てる画面",
  },
  {
    title: "シフトを確定する",
    body: "内容を確認して確定します。確定したあとで変更することもできます。",
    automations: ["確定シフトがスタッフ一人ひとりに届く", "変更したときは変わった人にだけ届く"],
    imageSrc: confirmedShiftNoticeImage,
    imageAlt: "スタッフのスマートフォンに届いた、確定シフトのお知らせ",
  },
];

export const HowItWorksSection = () => (
  <Box
    as="section"
    id="how-it-works"
    bg="white"
    py={{ base: 14, md: 18 }}
    scrollMarginTop={LANDING_HEADER_SCROLL_MARGIN_TOP}
  >
    <Container maxW="7xl">
      <VStack gap={3} textAlign="center">
        <SectionHeading phrases={["毎月やることは", "3つだけ"]} textAlign="center" />
        <Text color="gray.700" fontSize={{ base: "sm", md: "md" }} fontWeight="semibold" lineHeight="1.8">
          スタッフへの連絡は、シフトリからLINEやメールで届きます。
        </Text>
      </VStack>

      <SimpleGrid as="ol" columns={{ base: 1, lg: 3 }} gap={6} mt={{ base: 8, md: 10 }} listStyleType="none" p={0}>
        {steps.map((step, index) => (
          <StepCard key={step.title} number={index + 1} step={step} />
        ))}
      </SimpleGrid>
    </Container>
  </Box>
);

const StepCard = ({ number, step }: { number: number; step: Step }) => (
  <Flex
    as="li"
    direction="column"
    bg="white"
    borderWidth="1px"
    borderColor="gray.200"
    borderRadius="2xl"
    overflow="hidden"
  >
    {/* スマホ画面は上部だけを切り抜いた素材のため、枠の下端で画面を切って見せる。 */}
    <Flex align="flex-start" justify="center" h={{ base: "220px", md: "250px" }} bg="#eaf8f6" pt={6} overflow="hidden">
      <Image
        src={step.imageSrc}
        alt={step.imageAlt}
        w={{ base: "210px", md: "230px" }}
        objectFit="contain"
        loading="lazy"
        decoding="async"
      />
    </Flex>

    <Flex direction="column" flex="1" gap={3} p={{ base: 5, md: 6 }}>
      <Text color="teal.700" fontSize="sm" fontWeight="bold" lineHeight="1.4">
        STEP {number}
      </Text>
      <Heading as="h3" color="gray.950" fontSize={{ base: "xl", md: "2xl" }} lineHeight="1.4" letterSpacing="0">
        {step.title}
      </Heading>
      <Text color="gray.700" fontSize="sm" lineHeight="1.8">
        {step.body}
      </Text>

      <Box mt="auto" pt={4} borderTopWidth="1px" borderColor="gray.100">
        <Flex align="center" gap={1.5} color="teal.700" fontSize="xs" fontWeight="bold">
          <Icon as={LuZap} boxSize={4} aria-hidden />
          シフトリが自動で行うこと
        </Flex>
        <Stack as="ul" gap={2} mt={2} listStyleType="none" p={0}>
          {step.automations.map((automation) => (
            <Flex as="li" key={automation} align="flex-start" gap={2} color="gray.900" fontSize="sm" lineHeight="1.6">
              <Icon as={LuCheck} boxSize={4} mt={0.5} color="teal.600" flexShrink={0} aria-hidden />
              <Text as="span" fontWeight="semibold">
                {automation}
              </Text>
            </Flex>
          ))}
        </Stack>
      </Box>
    </Flex>
  </Flex>
);

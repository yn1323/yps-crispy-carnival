import { Box, Container, Flex, Grid, Icon, Image, Stack, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuArrowDown, LuFileSpreadsheet, LuImage, LuMessagesSquare, LuUserX } from "react-icons/lu";
import { SectionHeading } from "../SectionHeading";
import backofficeShiftChaosImage from "./backoffice-shift-chaos.png";

// 以降のsectionが「募集・催促・作成・共有」の順に解決策を示すため、課題も同じ4つの仕事で並べる。
const problems: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuMessagesSquare,
    title: "希望シフトがトークに流れる",
    body: "LINEのグループや個別のトークで集めると、希望シフトがほかの会話に埋もれて見落としやすくなります。",
  },
  {
    icon: LuUserX,
    title: "誰が未提出か分からない",
    body: "提出した人を名簿と見比べて数え、出していない人へ一人ずつ連絡することになります。",
  },
  {
    icon: LuFileSpreadsheet,
    title: "表への書き写しに時間がかかる",
    body: "紙やメッセージで届いた希望シフトをExcelに転記するたびに、手間と入力ミスが増えます。",
  },
  {
    icon: LuImage,
    title: "確定シフトを伝え直している",
    body: "完成したシフト表を撮影して送ったり、変更をもう一度知らせたりする作業が毎月発生します。",
  },
];

export const ProblemSection = () => (
  <Box as="section" bg="#fbfefe" borderTopWidth="1px" borderColor="gray.100" py={{ base: 14, md: 18 }}>
    <Container maxW="7xl">
      <SectionHeading phrases={["シフト集めで", "こんなことに", "困っていませんか"]} textAlign="center" />

      <Grid
        templateColumns={{ base: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 1fr)" }}
        gap={{ base: 8, lg: 12 }}
        alignItems="center"
        mt={{ base: 8, md: 10 }}
      >
        <Image
          src={backofficeShiftChaosImage}
          alt="バックヤードの机で、スマートフォンのメッセージや紙の希望メモに追われる店長のイラスト"
          w="full"
          maxW={{ base: "520px", lg: "none" }}
          mx="auto"
          aspectRatio={3 / 2}
          objectFit="contain"
          loading="lazy"
          decoding="async"
        />

        <Stack as="ul" gap={3} listStyleType="none" p={0}>
          {problems.map((problem) => (
            <Flex
              as="li"
              key={problem.title}
              align="flex-start"
              gap={4}
              bg="white"
              borderWidth="1px"
              borderColor="gray.200"
              borderRadius="lg"
              px={{ base: 4, md: 5 }}
              py={4}
            >
              <Flex
                align="center"
                justify="center"
                flexShrink={0}
                boxSize={10}
                bg="orange.50"
                color="orange.600"
                borderRadius="full"
              >
                <Icon as={problem.icon} boxSize={5} aria-hidden />
              </Flex>
              <Box minW={0}>
                <Text as="h3" color="gray.950" fontSize="md" fontWeight="bold" lineHeight="1.55">
                  {problem.title}
                </Text>
                <Text mt={1} color="gray.700" fontSize="sm" lineHeight="1.8">
                  {problem.body}
                </Text>
              </Box>
            </Flex>
          ))}
        </Stack>
      </Grid>

      <VStack gap={2} mt={{ base: 10, md: 12 }} color="teal.700">
        <Text fontSize={{ base: "lg", md: "xl" }} fontWeight="bold" textAlign="center" lineHeight="1.6">
          {["この4つの手間は", "シフトリで", "まとめて減らせます"].map((phrase) => (
            <Box key={phrase} as="span" display="inline-block">
              {phrase}
            </Box>
          ))}
        </Text>
        <Icon as={LuArrowDown} boxSize={7} aria-hidden />
      </VStack>
    </Container>
  </Box>
);

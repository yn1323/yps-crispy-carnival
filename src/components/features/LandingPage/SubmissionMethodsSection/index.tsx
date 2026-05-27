import { Box, Container, Flex, Grid, Heading, Icon, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import type { IconType } from "react-icons";
import { LuCalendarCheck, LuCheck, LuClock, LuUsers } from "react-icons/lu";
import dayImage from "./function-shift-by-day.webp";
import selectionImage from "./function-shift-by-selection.webp";
import timeImage from "./function-shift-by-time.webp";

type SubmissionMethodKey = "date" | "time" | "shiftType";

type SubmissionMethod = {
  key: SubmissionMethodKey;
  icon: IconType;
  tabLabel: string;
  lead: string;
  imageSrc: string;
  imageAlt: string;
  points: string[];
  recommendedFor: string[];
};

const submissionMethods: SubmissionMethod[] = [
  {
    key: "date",
    icon: LuCalendarCheck,
    tabLabel: "日ごとに提出",
    lead: "出勤できる日・休みたい日を、かんたんに選べます。",
    imageSrc: dayImage,
    imageAlt: "日ごとにシフト希望を提出する画面イメージ",
    points: ["出勤できる日だけ選んで提出", "未選択の日もひと目で確認"],
    recommendedFor: ["勤務時間が固定で、出勤の可否だけ知りたいお店"],
  },
  {
    key: "time",
    icon: LuClock,
    tabLabel: "時間指定で提出",
    lead: "スタッフが空き時間を入力して希望を出せます。",
    imageSrc: timeImage,
    imageAlt: "時間を指定してシフト希望を提出する画面イメージ",
    points: ["日ごとに働ける時間を入力", "短時間勤務や遅番希望も扱いやすい"],
    recommendedFor: ["学生・主婦など時間帯が変わりやすいお店"],
  },
  {
    key: "shiftType",
    icon: LuUsers,
    tabLabel: "勤務区分で提出",
    lead: "早番・遅番など、お店で使っている勤務区分から希望を選べます。",
    imageSrc: selectionImage,
    imageAlt: "勤務区分でシフト希望を提出する画面イメージ",
    points: ["早番・遅番などの区分で提出", "固定シフトや担当区分の確認に使いやすい"],
    recommendedFor: ["早番・遅番などの区分で組むお店"],
  },
];

export const SubmissionMethodsSection = () => {
  const [activeKey, setActiveKey] = useState<SubmissionMethodKey>("date");
  const activeMethod = submissionMethods.find((method) => method.key === activeKey) ?? submissionMethods[0];

  return (
    <Box as="section" bg="#f7fcfb" py={{ base: 16, md: 24 }}>
      <Container maxW="7xl">
        <VStack gap={{ base: 10, md: 12 }}>
          <VStack gap={5} textAlign="center">
            <Heading
              as="h2"
              color="gray.950"
              fontSize={{ base: "2xl", md: "4xl", xl: "5xl" }}
              lineHeight={{ base: "2rem", md: "3rem", xl: "3.75rem" }}
            >
              いろいろな
              <Box as="span" color="teal.700">
                提出方法に対応
              </Box>
            </Heading>
            <Box w="56px" h="6px" bg="teal.600" borderRadius="full" />
            <Text color="gray.700" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8" maxW="760px">
              現在と同じように提出できます。
              <Box as="span" display={{ base: "inline", md: "block" }}>
                固定シフトのお店も、日によって働ける時間が変わるお店も使えます。
              </Box>
            </Text>
          </VStack>

          <Box
            w="full"
            bg="white"
            borderWidth="1px"
            borderColor="blackAlpha.100"
            borderRadius={{ base: "2xl", md: "3xl" }}
            boxShadow="0 22px 56px rgba(15, 23, 42, 0.08)"
            overflow="hidden"
          >
            <SimpleGrid role="tablist" columns={3} borderBottomWidth="1px" borderBottomColor="blackAlpha.100">
              {submissionMethods.map((method) => (
                <MethodTab
                  key={method.key}
                  method={method}
                  isActive={method.key === activeKey}
                  onSelect={() => setActiveKey(method.key)}
                />
              ))}
            </SimpleGrid>

            <Grid
              id={`submission-method-panel-${activeMethod.key}`}
              role="tabpanel"
              aria-labelledby={`submission-method-tab-${activeMethod.key}`}
              templateColumns={{ base: "1fr", lg: "minmax(340px, 0.85fr) minmax(0, 1.15fr)" }}
              gap={{ base: 6, lg: 12 }}
              alignItems="center"
              px={{ base: 0, md: 9, lg: 12 }}
              py={{ base: 0, md: 10, lg: 12 }}
            >
              <SubmissionPreview imageSrc={activeMethod.imageSrc} imageAlt={activeMethod.imageAlt} />

              <VStack align="stretch" gap={{ base: 6, md: 7 }} px={{ base: 7, md: 0 }} pb={{ base: 8, md: 0 }}>
                <Text
                  color="gray.800"
                  textStyle={{ base: "bodySm", md: "body" }}
                  lineHeight="1.8"
                  fontWeight="semibold"
                >
                  {activeMethod.lead}
                </Text>

                <Box display={{ base: "none", md: "block" }} borderTopWidth="1px" borderTopColor="blackAlpha.100" />

                <VStack align="stretch" gap={{ base: 4, md: 5 }}>
                  {activeMethod.points.map((point) => (
                    <MethodPoint key={point}>{point}</MethodPoint>
                  ))}
                </VStack>

                <Box bg="teal.50" borderRadius="xl" px={{ base: 5, md: 6 }} py={{ base: 5, md: 6 }}>
                  <Text color="teal.700" textStyle="sm" fontWeight="bold">
                    こんなお店におすすめ
                  </Text>
                  <VStack align="stretch" gap={2} mt={3}>
                    {activeMethod.recommendedFor.map((item) => (
                      <Text
                        key={item}
                        color="gray.800"
                        textStyle={{ base: "sm", md: "md" }}
                        fontWeight="bold"
                        lineHeight="1.7"
                      >
                        {item}
                      </Text>
                    ))}
                  </VStack>
                </Box>
              </VStack>
            </Grid>
          </Box>
        </VStack>
      </Container>
    </Box>
  );
};

const MethodTab = ({
  method,
  isActive,
  onSelect,
}: {
  method: SubmissionMethod;
  isActive: boolean;
  onSelect: () => void;
}) => (
  <Flex
    as="button"
    id={`submission-method-tab-${method.key}`}
    role="tab"
    direction={{ base: "column", md: "row" }}
    align="center"
    justify="center"
    gap={{ base: 2, md: 4 }}
    minH={{ base: "96px", md: "88px" }}
    px={{ base: 2, md: 7 }}
    bg={isActive ? "teal.600" : "white"}
    color={isActive ? "white" : "gray.700"}
    cursor="pointer"
    borderRightWidth="1px"
    borderColor="blackAlpha.100"
    fontWeight="bold"
    aria-selected={isActive}
    aria-controls={`submission-method-panel-${method.key}`}
    onClick={onSelect}
    _last={{ borderRightWidth: "0", borderBottomWidth: "0" }}
    _hover={{ bg: isActive ? "teal.600" : "teal.50", color: isActive ? "white" : "teal.700" }}
    _focusVisible={{ outline: "3px solid", outlineColor: "teal.300", outlineOffset: "-3px" }}
  >
    <Icon as={method.icon} boxSize={{ base: 7, md: 8 }} />
    <Text as="span" fontSize={{ base: "sm", md: "lg" }} lineHeight={{ base: "1.35", md: "1.4" }} textAlign="center">
      {method.tabLabel}
    </Text>
  </Flex>
);

const MethodPoint = ({ children }: { children: string }) => (
  <Flex align="center" gap={{ base: 3, md: 4 }}>
    <Flex align="center" justify="center" flex="0 0 auto" boxSize={8} bg="teal.500" color="white" borderRadius="full">
      <Icon as={LuCheck} boxSize={5} />
    </Flex>
    <Text color="gray.950" textStyle={{ base: "sm", md: "lg" }} fontWeight="bold" lineHeight="1.7">
      {children}
    </Text>
  </Flex>
);

const SubmissionPreview = ({ imageSrc, imageAlt }: { imageSrc: string; imageAlt: string }) => (
  <Flex align="center" justify="center" pt={{ base: 5, md: 0 }}>
    <Image
      src={imageSrc}
      alt={imageAlt}
      w="full"
      maxW={{ base: "min(360px, 92vw)", md: "360px", lg: "400px" }}
      aspectRatio="824 / 975"
      objectFit="contain"
      loading="lazy"
    />
  </Flex>
);

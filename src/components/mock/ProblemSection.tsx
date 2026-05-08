import { Box, Container, Flex, Heading, Icon, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuArrowRight, LuBell, LuCalendarCheck, LuMessageCircle } from "react-icons/lu";
import issueCheckSubmissionImage from "./issue-check-submission.webp";
import issueCollectImage from "./issue-collect.webp";
import issueNotifyChangeImage from "./issue-notify-change.webp";
import issueRewriteExcelImage from "./issue-rewrite-excel.webp";

const problemCards = [
  { number: "01", title: "希望を集める", image: issueCollectImage, alt: "LINEやメモで集まった希望を見返すイメージ" },
  {
    number: "02",
    title: "未提出を追う",
    image: issueCheckSubmissionImage,
    alt: "提出状況を確認して未提出者を把握するイメージ",
  },
  { number: "03", title: "表に転記する", image: issueRewriteExcelImage, alt: "集めた希望を表に転記するイメージ" },
  { number: "04", title: "変更を伝える", image: issueNotifyChangeImage, alt: "完成後の変更を共有するイメージ" },
];

const solutionSteps = [
  { icon: LuMessageCircle, title: "集める", body: "LINEで提出" },
  { icon: LuCalendarCheck, title: "作る", body: "希望を見て作成" },
  { icon: LuBell, title: "共有する", body: "まとめて通知" },
];

export const ProblemSection = () => (
  <Box as="section" id="how" bg="gray.50" py={{ base: 16, md: 24 }}>
    <Container maxW="7xl">
      <VStack gap={{ base: 10, md: 14 }}>
        <VStack gap={5} textAlign="center">
          <Heading
            as="h2"
            color="gray.950"
            fontSize={{ base: "3xl", md: "4xl", xl: "5xl" }}
            lineHeight={{ base: "2.5rem", md: "3rem", xl: "3.75rem" }}
          >
            シフト作成は
            <Box as="span" color="teal.700">
              意外と手間が多い
            </Box>
          </Heading>
          <Box w="56px" h="6px" bg="teal.600" borderRadius="full" />
          <Text color="gray.700" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8">
            希望回収だけでなく、未提出確認や転記、変更共有にも時間がかかります。
          </Text>
        </VStack>

        <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} gap={{ base: 4, md: 7 }} w="full">
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
              <Flex align="center" justify={{ base: "center", lg: "start" }} gap={3}>
                <Flex align="center" justify="center" boxSize={{ base: 12, md: 14 }} bg="white" borderRadius="full">
                  <Image src="/logo192.webp" alt="シフトリ" boxSize={{ base: 8, md: 10 }} objectFit="contain" />
                </Flex>
                <Text color="gray.950" textStyle={{ base: "md", md: "xl" }} fontWeight="bold">
                  シフトリなら、
                </Text>
              </Flex>
              <Heading as="h3" color="gray.950" fontSize={{ base: "2xl", md: "3xl" }} lineHeight="1.35">
                <Box as="span" color="teal.700">
                  集める・作る・共有を
                </Box>
                ひとつに
              </Heading>
              <Text color="gray.950" textStyle={{ base: "bodySm", md: "md" }} fontWeight="bold" lineHeight="1.8">
                シフト作成の流れを
                <Box as="span" color="teal.700">
                  もっとラクに
                </Box>
              </Text>
            </VStack>

            <SimpleGrid columns={3} gap={{ base: 2, md: 5 }} w="full">
              {solutionSteps.map((step, index) => (
                <SolutionStep key={step.title} {...step} showArrow={index < solutionSteps.length - 1} />
              ))}
            </SimpleGrid>
          </SimpleGrid>
        </Box>
      </VStack>
    </Container>
  </Box>
);

const ProblemCard = ({ number, title, image, alt }: { number: string; title: string; image: string; alt: string }) => (
  <Box
    bg="white"
    borderRadius="2xl"
    px={{ base: 5, md: 8 }}
    py={{ base: 5, md: 8 }}
    boxShadow="0 14px 34px rgba(15, 23, 42, 0.08)"
  >
    <Flex align="center" gap={{ base: 3, md: 5 }}>
      <Flex
        align="center"
        justify="center"
        flex="0 0 auto"
        boxSize={{ base: 10, md: 14 }}
        bg="teal.500"
        color="white"
        borderRadius="full"
        textStyle={{ base: "md", md: "xl" }}
        fontWeight="bold"
      >
        {number}
      </Flex>
      <Heading as="h3" color="gray.950" textStyle={{ base: "md", md: "lg" }} lineHeight="1.4">
        {title}
      </Heading>
    </Flex>

    <Flex align="center" justify="center" h={{ base: "148px", md: "220px" }} mt={{ base: 4, md: 8 }} borderRadius="xl">
      <Image src={image} alt={alt} maxH="full" w="full" objectFit="contain" loading="lazy" />
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
  <Flex align="center" justify="center" gap={{ base: 2, md: 5 }}>
    <VStack gap={3} minW={{ base: "auto", md: "120px" }} textAlign="center">
      <Flex
        align="center"
        justify="center"
        boxSize={{ base: 14, md: 20 }}
        bg="white"
        color="teal.700"
        borderRadius="full"
      >
        <Icon as={icon} boxSize={{ base: 7, md: 10 }} />
      </Flex>
      <VStack gap={1}>
        <Text color="teal.700" textStyle={{ base: "md", md: "xl" }} fontWeight="bold">
          {title}
        </Text>
        <Text
          display={{ base: "none", md: "block" }}
          color="gray.950"
          textStyle="sm"
          fontWeight="bold"
          lineHeight="1.6"
        >
          {body}
        </Text>
      </VStack>
    </VStack>
    {showArrow && <Icon as={LuArrowRight} display={{ base: "none", md: "block" }} color="teal.600" boxSize={7} />}
  </Flex>
);

import { Box, Container, Flex, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { LANDING_HEADER_SCROLL_MARGIN_TOP } from "../constants";
import { SectionHeading } from "../SectionHeading";
import autoReminderImage from "./auto-reminder.webp";
import collectShiftImage from "./collect-shift.webp";
import shareConfirmedShiftImage from "./share-confirmed-shift.webp";

const reliefItems: Array<{ imageSrc: string; title: string; body: string }> = [
  {
    imageSrc: collectShiftImage,
    title: "LINEで希望シフトを回収",
    body: "募集開始時に提出リンクをLINE・メールで自動送信。スタッフはアプリを入れずに、スマホから希望を出せます。",
  },
  {
    imageSrc: autoReminderImage,
    title: "自動リマインド",
    body: "シフトを出していない人に自動でお知らせが届きます。「シフトまだ？」と個別に聞いて回る手間が減ります。",
  },
  {
    imageSrc: shareConfirmedShiftImage,
    title: "確定シフトを自動共有",
    body: "確定したシフトをLINE・メールで全員へ。「見てなかった」を防げます。",
  },
];

export const ReliefSection = () => (
  <Box
    as="section"
    id="features"
    bg="#fbfefe"
    borderTopWidth="1px"
    borderBottomWidth="1px"
    borderColor="gray.100"
    py={14}
    scrollMarginTop={LANDING_HEADER_SCROLL_MARGIN_TOP}
  >
    <Container maxW="7xl">
      <VStack gap={9}>
        <SectionHeading phrases={["自動で回収・催促・共有"]} textAlign="center" />

        <SimpleGrid columns={{ base: 1, md: 3 }} gap={8} w="full">
          {reliefItems.map((item) => (
            <ReliefCard key={item.title} {...item} />
          ))}
        </SimpleGrid>
      </VStack>
    </Container>
  </Box>
);

const ReliefCard = ({ imageSrc, title, body }: { imageSrc: string; title: string; body: string }) => (
  <Flex align="center" gap={{ base: 4, md: 5, lg: 6 }}>
    <Flex align="center" justify="center" flex="0 0 auto" boxSize={{ base: "104px", md: "112px", lg: "128px" }}>
      <Image src={imageSrc} alt="" w="full" h="full" objectFit="contain" loading="lazy" />
    </Flex>

    <Box minW={0}>
      <Text color="gray.950" fontSize="lg" fontWeight="bold" lineHeight="1.55">
        {title}
      </Text>
      <Text mt={2} color="gray.700" fontSize="sm" lineHeight="1.8" fontWeight="semibold">
        {body}
      </Text>
    </Box>
  </Flex>
);

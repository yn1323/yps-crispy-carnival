import { Box, Container, Flex, Heading, Icon, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuBell, LuMessageCircle, LuSend } from "react-icons/lu";

const reliefItems: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuMessageCircle,
    title: "LINEで希望シフトを回収",
    body: "LINE・メールで提出リンクを送信。スタッフはアプリ不要で、リンクを開いて提出するだけです。",
  },
  {
    icon: LuBell,
    title: "自動リマインド",
    body: "未提出者へ自動でお知らせ。店長が個別に確認する手間を減らします。",
  },
  {
    icon: LuSend,
    title: "確定シフトを自動共有",
    body: "確定したシフトをLINE・メールで共有。「見てない」を防ぎます。",
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
  >
    <Container maxW="7xl">
      <VStack gap={9}>
        <Heading as="h2" fontSize={{ base: "2xl", md: "3xl" }} lineHeight="1.5" letterSpacing="0" textAlign="center">
          LINEで希望シフトを回収し、未提出者に自動リマインド。
        </Heading>

        <SimpleGrid columns={{ base: 1, md: 3 }} gap={8} w="full">
          {reliefItems.map((item) => (
            <ReliefCard key={item.title} {...item} />
          ))}
        </SimpleGrid>
      </VStack>
    </Container>
  </Box>
);

const ReliefCard = ({ icon, title, body }: { icon: IconType; title: string; body: string }) => (
  <Flex align="center" gap={6}>
    <Flex
      align="center"
      justify="center"
      flex="0 0 auto"
      boxSize={24}
      bg="teal.50"
      color="teal.600"
      borderRadius="full"
      borderWidth="1px"
      borderColor="teal.100"
    >
      <Icon as={icon} boxSize={11} />
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

import { Box, Container, Flex, Icon, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuBell, LuMessageCircle, LuSend } from "react-icons/lu";
import { SectionHeading } from "../SectionHeading";

const reliefItems: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuMessageCircle,
    title: "LINEで希望シフトを回収",
    body: "提出リンクをLINEやメールで送るだけ。スタッフはアプリを入れずに、スマホから希望を出せます。",
  },
  {
    icon: LuBell,
    title: "自動リマインド",
    body: "出していない人にだけ、自動でお知らせが届きます。「シフトまだ？」と個別に聞いて回る手間が減ります。",
  },
  {
    icon: LuSend,
    title: "確定シフトを自動共有",
    body: "確定したシフトは、そのままLINE・メールで全員へ。「見てなかった」を防げます。",
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
        <SectionHeading phrases={["希望シフトの回収はLINEで。", "催促は自動リマインドで。"]} textAlign="center" />

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
  <Flex align="center" gap={{ base: 4, md: 6 }}>
    <Flex
      align="center"
      justify="center"
      flex="0 0 auto"
      boxSize={{ base: 20, md: 24 }}
      bg="teal.50"
      color="teal.600"
      borderRadius="full"
      borderWidth="1px"
      borderColor="teal.100"
    >
      <Icon as={icon} boxSize={{ base: 9, md: 11 }} />
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

import { Box, Container, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuHouse, LuScissors, LuShoppingCart, LuUsers, LuUtensils } from "react-icons/lu";
import { LANDING_HEADER_SCROLL_MARGIN_TOP } from "../constants";
import { SectionHeading } from "../SectionHeading";

const industries: Array<{ icon: IconType; label: string }> = [
  { icon: LuUtensils, label: "飲食店" },
  { icon: LuShoppingCart, label: "小売店" },
  { icon: LuUsers, label: "介護・施設" },
  { icon: LuHouse, label: "イベント運営" },
  { icon: LuScissors, label: "美容・サロン" },
];

export const UseCasesSection = () => (
  <Box as="section" id="use-cases" bg="#fbfefe" py={14} scrollMarginTop={LANDING_HEADER_SCROLL_MARGIN_TOP}>
    <Container maxW="7xl">
      <VStack align="stretch" gap={12}>
        <VStack align="stretch" gap={5}>
          <SectionHeading phrases={["いろいろなお店で使われています"]} textAlign="center" />
          <Flex wrap="wrap" justify="center" rowGap={4} columnGap={{ base: 2, md: 4 }}>
            {industries.map((industry) => (
              <IndustryItem key={industry.label} {...industry} />
            ))}
          </Flex>
          <Text color="gray.700" fontSize="sm" lineHeight="1.8" fontWeight="semibold" textAlign="center">
            ランチ・ディナー、平日・週末、早番・遅番、短期スタッフなど、お店のシフトの組み方に合わせて使えます。
          </Text>
        </VStack>
      </VStack>
    </Container>
  </Box>
);

const IndustryItem = ({ icon, label }: { icon: IconType; label: string }) => (
  <Flex
    direction="column"
    align="center"
    gap={3}
    minH={{ base: "88px", md: "112px" }}
    justify="center"
    w={{ base: "30%", md: "18%" }}
  >
    <Icon as={icon} boxSize={10} color="teal.600" strokeWidth={1.7} />
    <Text color="gray.950" fontSize="sm" fontWeight="bold" textAlign="center" lineHeight="1.5">
      {label}
    </Text>
  </Flex>
);

import { Flex, Icon, Text } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";

const trialConditions = ["2か月無料トライアル", "トライアル中クレジットカード登録不要"];

export function TrialReassurance() {
  return (
    <Flex
      as="ul"
      align="center"
      columnGap={5}
      rowGap={2}
      flexWrap="wrap"
      m={0}
      p={0}
      color="gray.700"
      fontSize="sm"
      fontWeight="semibold"
      listStyleType="none"
      aria-label="無料トライアルの条件"
    >
      {trialConditions.map((condition) => (
        <Flex as="li" key={condition} align="center" gap={2} whiteSpace="nowrap">
          <Icon as={LuCheck} boxSize={4} color="teal.600" flexShrink={0} aria-hidden />
          <Text as="span">{condition}</Text>
        </Flex>
      ))}
    </Flex>
  );
}

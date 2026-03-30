import { Flex, Text } from "@chakra-ui/react";
import { LuInfo } from "react-icons/lu";

export const FooterInfo = () => {
  return (
    <Flex align="center" gap={1.5} px={4} py={3} borderTopWidth="1px" borderColor="border">
      <LuInfo size={14} color="var(--chakra-colors-fg-subtle)" />
      <Text fontSize="xs" color="fg.muted">
        このページは14日間閲覧できます
      </Text>
    </Flex>
  );
};

import { Box, Flex, Text } from "@chakra-ui/react";

type Props = {
  shopName: string;
};

export const StaffHeader = ({ shopName }: Props) => {
  return (
    <Box
      as="header"
      position="fixed"
      top={0}
      left={0}
      right={0}
      h={{ base: "48px", lg: "56px" }}
      bg="teal.600"
      zIndex={20}
    >
      <Flex maxW="1024px" mx="auto" h="full" px={{ base: 4, lg: 6 }} align="center">
        <Text color="white" fontWeight="bold" fontSize={{ base: "md", lg: "lg" }}>
          {shopName}
        </Text>
      </Flex>
    </Box>
  );
};

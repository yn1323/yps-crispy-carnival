import { Box, type BoxProps, Flex, HStack, Image, Text } from "@chakra-ui/react";
import { LuLock } from "react-icons/lu";

type Props = {
  src: string;
  alt: string;
  url?: string;
  maxW?: BoxProps["maxW"];
};

export const BrowserMockup = ({ src, alt, url = "shiftori.app", maxW }: Props) => (
  <Box
    w="full"
    maxW={maxW}
    bg="white"
    borderWidth="1px"
    borderColor="blackAlpha.100"
    borderRadius="12px"
    overflow="hidden"
    boxShadow="0 20px 40px rgba(0, 0, 0, 0.08)"
  >
    <Box position="relative" bg="gray.100" h={{ base: "32px", lg: "40px" }}>
      <HStack
        position="absolute"
        left={{ base: "12px", lg: "16px" }}
        top="50%"
        transform="translateY(-50%)"
        gap={{ base: "6px", lg: "8px" }}
      >
        <Box boxSize={{ base: "10px", lg: "12px" }} borderRadius="full" bg="#FF5F57" />
        <Box boxSize={{ base: "10px", lg: "12px" }} borderRadius="full" bg="#FEBC2E" />
        <Box boxSize={{ base: "10px", lg: "12px" }} borderRadius="full" bg="#28C840" />
      </HStack>
      <Flex h="full" align="center" justify="center">
        <Flex
          align="center"
          gap={{ base: "4px", lg: "6px" }}
          bg="white"
          borderRadius="6px"
          px={{ base: "10px", lg: "12px" }}
          py={{ base: "3px", lg: "4px" }}
          color="#6B7280"
        >
          <LuLock size={12} />
          <Text fontSize={{ base: "11px", lg: "13px" }}>{url}</Text>
        </Flex>
      </Flex>
    </Box>
    <Image src={src} alt={alt} w="full" h="auto" display="block" />
  </Box>
);

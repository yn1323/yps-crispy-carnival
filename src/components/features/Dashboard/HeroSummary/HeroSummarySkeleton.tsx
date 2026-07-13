import { Flex, HStack, Skeleton, Stack } from "@chakra-ui/react";

export const HeroSummarySkeleton = () => (
  <Stack gap={{ base: 5, lg: 6 }} aria-label="ダッシュボード概要を読み込み中">
    <Stack gap={3} pb={{ base: 4, lg: 6 }} borderBottomWidth="1px" borderColor="gray.200">
      <Skeleton display={{ base: "none", md: "block" }} h="18px" w="40px" />

      <Flex align="center" justify="space-between" direction="row" gap={4} minW={0}>
        <Skeleton h={{ base: "28px", md: "40px" }} w={{ base: "160px", md: "240px" }} maxW="60%" />
        <Skeleton h="32px" w="48px" flexShrink={0} />
      </Flex>
    </Stack>

    <Stack gap={{ base: 3, lg: 4 }}>
      <HStack gap={2.5} align="center">
        <Skeleton boxSize={{ base: "24px", lg: "28px" }} borderRadius="full" />
        <Skeleton h={{ base: "26px", lg: "30px" }} w="112px" />
      </HStack>

      <Stack
        gap={0}
        bg="white"
        borderRadius="xl"
        borderWidth="1px"
        borderColor="blackAlpha.50"
        boxShadow="xs"
        overflow="hidden"
      >
        <ActionTaskRowSkeleton />
      </Stack>
    </Stack>
  </Stack>
);

const ActionTaskRowSkeleton = () => (
  <Flex
    bg="white"
    px={{ base: 4, md: 6, lg: 7 }}
    py={{ base: 4, md: 5 }}
    gap={{ base: 4, md: 5 }}
    align={{ base: "stretch", md: "center" }}
    direction={{ base: "column", md: "row" }}
  >
    <HStack gap={{ base: 3, md: 4 }} align={{ base: "flex-start", md: "center" }} flex={1} minW={0}>
      <Skeleton boxSize={{ base: "48px", md: "56px" }} borderRadius="full" flexShrink={0} />
      <Stack gap={2} minW={0} flex={1}>
        <Skeleton h={{ base: "20px", md: "24px" }} w={{ base: "220px", md: "300px" }} maxW="100%" />
        <HStack gap={2} wrap="wrap">
          <Skeleton h="24px" w="112px" borderRadius="full" />
          <Skeleton h="24px" w="92px" borderRadius="full" />
          <Skeleton h="24px" w="128px" borderRadius="full" />
        </HStack>
      </Stack>
    </HStack>
    <Skeleton h={{ base: "40px", md: "40px" }} w={{ base: "100%", md: "136px" }} flexShrink={0} />
  </Flex>
);

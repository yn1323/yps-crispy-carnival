import { Box, Flex, Skeleton, Stack } from "@chakra-ui/react";

export function UserDetailSkeleton() {
  return (
    <Stack gap={{ base: 4, md: 6 }} aria-label="ユーザー詳細を読み込み中">
      <Flex align="center" gap={3}>
        <Skeleton boxSize="32px" borderRadius="md" />
        <Skeleton h="30px" w="160px" />
      </Flex>
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
        <Flex direction={{ base: "column", md: "row" }} align={{ md: "center" }} gap={4}>
          <Flex flex={1} align="center" gap={3}>
            <Skeleton boxSize="52px" borderRadius="full" />
            <Stack gap={2} flex={1}>
              <Skeleton h="24px" w="220px" />
              <Skeleton h="16px" w="280px" maxW="full" />
            </Stack>
          </Flex>
          <Skeleton h="40px" w={{ base: "full", md: "260px" }} borderRadius="md" />
        </Flex>
      </Box>

      <Stack gap={3}>
        <Skeleton h="28px" w="120px" />
        <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            <Stack gap={5} p={{ base: 4, md: 5 }}>
              <Skeleton h="22px" w="112px" />
              <Skeleton h="56px" w="full" borderRadius="md" />
              <Skeleton h="56px" w="full" borderRadius="md" />
              <Flex justify="flex-end">
                <Skeleton h="40px" w="120px" borderRadius="md" />
              </Flex>
            </Stack>
            {Array.from({ length: 2 }).map((_, index) => (
              <Stack key={index} gap={4} p={{ base: 4, md: 5 }}>
                <Skeleton h="22px" w={index === 0 ? "112px" : "144px"} />
                <Skeleton h="16px" w="min(420px, 100%)" />
                <Flex justify="flex-end">
                  <Skeleton h="40px" w="156px" borderRadius="md" />
                </Flex>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Stack>

      <Stack gap={3}>
        <Skeleton h="28px" w="120px" />
        <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            <Stack gap={4} p={{ base: 4, md: 5 }}>
              <Skeleton h="22px" w="96px" />
              <Skeleton h="68px" w="full" borderRadius="lg" />
            </Stack>
            <Stack gap={3} p={{ base: 4, md: 5 }}>
              <Skeleton h="22px" w="112px" />
              <Skeleton h="44px" w="full" borderRadius="lg" />
            </Stack>
            <Box>
              <Flex gap={6} px={{ base: 4, md: 6 }} py={3} borderBottomWidth="1px" borderColor="blackAlpha.100">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} h="20px" w="64px" />
                ))}
              </Flex>
              <Stack gap={5} p={{ base: 4, md: 6 }}>
                <Skeleton h="22px" w="180px" />
                <Skeleton h="64px" w="full" borderRadius="md" />
                <Skeleton h="64px" w="full" borderRadius="md" />
              </Stack>
            </Box>
          </Stack>
        </Box>
      </Stack>
    </Stack>
  );
}

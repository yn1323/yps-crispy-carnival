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
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Flex gap={6} px={{ base: 4, md: 6 }} py={3} borderBottomWidth="1px" borderColor="blackAlpha.100">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} h="20px" w="48px" />
          ))}
        </Flex>
        <Stack gap={5} p={{ base: 4, md: 6 }}>
          <Skeleton h="22px" w="180px" />
          <Skeleton h="16px" w="min(520px, 100%)" />
          <Skeleton h="64px" w="full" borderRadius="md" />
          <Skeleton h="64px" w="full" borderRadius="md" />
        </Stack>
      </Box>
    </Stack>
  );
}

import { Box, Flex, Skeleton, Stack } from "@chakra-ui/react";

export function UserDetailSkeleton() {
  return (
    <Stack gap={{ base: 4, md: 6 }} aria-label="ユーザー詳細を読み込み中">
      <Flex align="center" gap={3}>
        <Skeleton boxSize="32px" borderRadius="md" />
        <Skeleton h="30px" w="160px" />
      </Flex>

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
        <Flex align="center" gap={3}>
          <Skeleton boxSize="52px" borderRadius="full" />
          <Stack gap={2} flex={1} minW={0}>
            <Skeleton h="24px" w="220px" maxW="75%" />
            <Skeleton h="16px" w="280px" maxW="100%" />
          </Stack>
        </Flex>
      </Box>

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 3, md: 4 }}>
        <Flex align="center" gap={3}>
          <Skeleton boxSize="40px" borderRadius="full" />
          <Stack gap={2} flex={1}>
            <Skeleton h="20px" w="96px" />
            <Skeleton h="16px" w="260px" maxW="80%" />
          </Stack>
          <Skeleton boxSize="20px" />
        </Flex>
      </Box>

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Flex align="center" justify="space-between" gap={3} px={{ base: 4, md: 5 }} py={4}>
          <Skeleton h="22px" w="96px" />
          <Skeleton h="32px" w="112px" borderRadius="md" />
        </Flex>
        <Stack gap={0} p={{ base: 3, md: 4 }} divideY="1px" divideColor="blackAlpha.100">
          {Array.from({ length: 2 }).map((_, index) => (
            <Flex key={index} align="center" gap={3} py={3.5} px={{ base: 3, md: 4 }}>
              <Skeleton boxSize="40px" borderRadius="full" />
              <Stack gap={2} flex={1}>
                <Skeleton h="20px" w={index === 0 ? "240px" : "200px"} maxW="70%" />
                <Skeleton h="18px" w="104px" borderRadius="full" />
              </Stack>
              <Skeleton boxSize="20px" />
            </Flex>
          ))}
        </Stack>
      </Box>

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
        <Stack gap={4}>
          <Stack gap={2}>
            <Skeleton h="20px" w="160px" />
            <Skeleton h="16px" w="460px" maxW="90%" />
          </Stack>
          <Flex justify="flex-end">
            <Skeleton h="40px" w="88px" borderRadius="md" />
          </Flex>
        </Stack>
      </Box>
    </Stack>
  );
}

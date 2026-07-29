import { Box, Flex, Skeleton, Stack } from "@chakra-ui/react";

export function UserShopDetailSkeleton() {
  return (
    <Stack gap={{ base: 4, md: 6 }} aria-label="店舗別設定を読み込み中">
      <Flex align="center" gap={3}>
        <Skeleton boxSize="32px" borderRadius="md" />
        <Skeleton h="30px" w={{ base: "240px", md: "360px" }} maxW="80%" />
      </Flex>

      {Array.from({ length: 3 }).map((_, index) => (
        <Box
          key={index}
          borderWidth="1px"
          borderColor="blackAlpha.100"
          borderRadius="xl"
          bg="white"
          p={{ base: 4, md: 6 }}
        >
          <Stack gap={4}>
            <Skeleton h="22px" w={index === 1 ? "80px" : "120px"} />
            <Skeleton h="16px" w="440px" maxW="90%" />
            <Skeleton h={index === 1 ? "120px" : "72px"} w="full" borderRadius="lg" />
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

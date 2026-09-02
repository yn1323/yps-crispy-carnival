import { Box, Flex, Grid, HStack, Skeleton, Stack } from "@chakra-ui/react";
import { DetailPageHeaderSkeleton } from "@/src/components/ui/DetailPageHeader";

export function ManagerSettingsSkeleton() {
  return (
    <Stack gap={{ base: 6, md: 8 }} aria-label="管理者設定を読み込み中" aria-busy="true">
      <DetailPageHeaderSkeleton titleWidth={{ base: "128px", md: "160px" }} showIcon={false} />
      <Stack gap={4}>
        <SectionHeadingSkeleton width="136px" />
        <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }} gap={3}>
          {Array.from({ length: 2 }, (_, index) => (
            <Flex
              key={index}
              minH={{ base: "104px", sm: "96px" }}
              px={{ base: 3.5, sm: 4 }}
              py={3.5}
              align="center"
              gap={3.5}
              bg="white"
              borderWidth="1px"
              borderColor="border.default"
              borderRadius="xl"
              boxShadow="xs"
            >
              <Skeleton boxSize={{ base: "42px", sm: "44px" }} borderRadius="lg" flexShrink={0} />
              <Stack gap={2} flex={1}>
                <Skeleton h="20px" w={index === 0 ? "224px" : "240px"} maxW="90%" />
                <Skeleton h="16px" w="88%" />
              </Stack>
              <Skeleton boxSize="20px" borderRadius="sm" flexShrink={0} />
            </Flex>
          ))}
        </Grid>
      </Stack>

      <Grid
        templateColumns="repeat(2, minmax(0, 1fr))"
        bg="white"
        borderWidth="1px"
        borderRadius="xl"
        divideX="1px"
        divideColor="blackAlpha.100"
      >
        {Array.from({ length: 2 }, (_, index) => (
          <Stack key={index} align="center" gap={2} px={4} py={4}>
            <Skeleton h="18px" w={index === 0 ? "52px" : "64px"} />
            <Skeleton h="22px" w="56px" />
          </Stack>
        ))}
      </Grid>

      <Stack gap={4}>
        <SectionHeadingSkeleton width="144px" />
        <ManagerListSkeleton kind="manager" />
      </Stack>
      <Stack gap={4}>
        <SectionHeadingSkeleton width="224px" />
        <ManagerListSkeleton kind="invitation" />
      </Stack>
    </Stack>
  );
}

export function ManagerCandidatePageSkeleton() {
  return (
    <Stack gap={{ base: 6, md: 8 }} aria-label="管理者候補を読み込み中" aria-busy="true">
      <DetailPageHeaderSkeleton titleWidth={{ base: "208px", md: "304px" }} showIcon={false} />
      <Stack gap={4}>
        <Stack gap={2}>
          <Skeleton h="24px" w="208px" maxW="80%" />
          <Skeleton h="18px" w="360px" maxW="100%" />
        </Stack>
        <Stack gap={0} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" overflow="hidden">
          {Array.from({ length: 3 }, (_, index) => (
            <Flex key={index} gap={3} px={{ base: 3, md: 4 }} py={3.5} minH="72px" align="center">
              <Skeleton boxSize="20px" borderRadius="full" />
              <Skeleton boxSize="40px" borderRadius="full" />
              <Stack gap={2} flex={1}>
                <Skeleton h="18px" w={index === 1 ? "144px" : "112px"} />
                <Skeleton h="14px" w="64%" />
              </Stack>
            </Flex>
          ))}
        </Stack>
        <Flex justify="flex-end">
          <Skeleton h="44px" w={{ base: "full", md: "208px" }} borderRadius="md" />
        </Flex>
      </Stack>
    </Stack>
  );
}

export function ManagerExternalInvitePageSkeleton() {
  return (
    <Stack gap={{ base: 6, md: 8 }} aria-label="管理者招待フォームを読み込み中" aria-busy="true">
      <DetailPageHeaderSkeleton titleWidth={{ base: "208px", md: "304px" }} showIcon={false} />
      <Stack gap={5} maxW="640px" w="full">
        <Skeleton h="18px" w="392px" maxW="100%" />
        {Array.from({ length: 2 }, (_, index) => (
          <Stack key={index} gap={2}>
            <Skeleton h="20px" w={index === 0 ? "40px" : "112px"} />
            <Skeleton h="44px" w="full" borderRadius="md" />
          </Stack>
        ))}
        <Flex justify="flex-end">
          <Skeleton h="44px" w={{ base: "full", md: "208px" }} borderRadius="md" />
        </Flex>
      </Stack>
    </Stack>
  );
}

function SectionHeadingSkeleton({ width }: { width: string }) {
  return (
    <HStack gap={2.5}>
      <Skeleton boxSize={{ base: "20px", md: "24px" }} borderRadius="sm" />
      <Skeleton h={{ base: "28px", md: "30px" }} w={width} />
    </HStack>
  );
}

function ManagerListSkeleton({ kind }: { kind: "manager" | "invitation" }) {
  return (
    <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
      <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
        {Array.from({ length: 2 }, (_, index) => (
          <Flex
            key={index}
            direction={{ base: "column", md: "row" }}
            gap={3}
            px={{ base: 3, md: 4 }}
            py={3.5}
            align={{ base: "stretch", md: "center" }}
          >
            <HStack gap={3} flex={1}>
              <Skeleton boxSize="40px" borderRadius="full" />
              <Stack gap={2} flex={1}>
                <Skeleton h="18px" w={index === 0 ? "112px" : "144px"} />
                <Skeleton h="14px" w="224px" maxW="80%" />
              </Stack>
            </HStack>
            {kind === "manager" ? (
              <Skeleton h={{ base: "44px", md: "36px" }} w={{ base: "full", md: "144px" }} borderRadius="md" />
            ) : (
              <>
                <Stack gap={2} align={{ base: "flex-start", md: "flex-end" }} minW={{ md: "176px" }}>
                  <Skeleton h="20px" w="56px" borderRadius="full" />
                  <Skeleton h="14px" w="152px" />
                </Stack>
                <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={2} minW={{ md: "196px" }}>
                  <Skeleton h={{ base: "44px", md: "36px" }} borderRadius="md" />
                  <Skeleton h={{ base: "44px", md: "36px" }} borderRadius="md" />
                </Grid>
              </>
            )}
          </Flex>
        ))}
      </Stack>
    </Box>
  );
}

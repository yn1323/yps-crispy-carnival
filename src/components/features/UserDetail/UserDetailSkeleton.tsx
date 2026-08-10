import { Box, Flex, HStack, Skeleton, Stack } from "@chakra-ui/react";
import { DeletionActionSectionSkeleton } from "@/src/components/shared/DeletionActionSection";
import { DetailPageHeaderSkeleton } from "@/src/components/ui/DetailPageHeader";

const membershipBadgeWidths = [["88px"], ["80px", "72px", "80px"]] as const;

export function UserDetailSkeleton() {
  return (
    <Stack gap={{ base: 4, md: 6 }} aria-label="スタッフ詳細を読み込み中" aria-busy="true">
      <DetailPageHeaderSkeleton titleWidth="160px" />

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
        <Flex direction={{ base: "column", md: "row" }} align={{ base: "stretch", md: "center" }} gap={4}>
          <HStack flex={1} minW={0} gap={3} align="center">
            <Skeleton boxSize="52px" borderRadius="full" flexShrink={0} />
            <Stack gap={1} minW={0} flex={1}>
              <Skeleton h={{ base: "28px", lg: "30px" }} w="220px" maxW="75%" />
              <Skeleton h="20px" w="280px" maxW="100%" />
            </Stack>
          </HStack>
        </Flex>
      </Box>

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Flex align="center" gap={3} px={{ base: 3, md: 4 }} py={3.5}>
          <Skeleton boxSize="40px" borderRadius="full" flexShrink={0} />
          <Stack gap={1} flex={1} minW={0}>
            <Skeleton h="24px" w="112px" />
            <Skeleton h="20px" w="280px" maxW="90%" />
          </Stack>
          <Skeleton boxSize="20px" borderRadius="sm" flexShrink={0} />
        </Flex>
      </Box>

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Flex align="center" justify="space-between" gap={3} px={{ base: 4, md: 5 }} pt={4} pb={0}>
          <Skeleton h="24px" w={{ base: "132px", md: "184px" }} maxW="calc(100% - 148px)" />
          <Skeleton h="32px" w="136px" borderRadius="md" flexShrink={0} />
        </Flex>
        <Box p={{ base: 3, md: 4 }}>
          <Box borderRadius="lg" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
            <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
              {membershipBadgeWidths.map((badgeWidths, index) => (
                <Flex key={index} align="center" gap={3} px={{ base: 3, md: 4 }} py={3.5}>
                  <Skeleton boxSize="40px" borderRadius="full" flexShrink={0} />
                  <Flex flex={1} minW={0} align="center" gap={2} wrap="wrap">
                    <Skeleton h="24px" w={index === 0 ? "96px" : "112px"} maxW="60%" />
                    <HStack gap={1.5} wrap="wrap" ms="auto" flexShrink={0}>
                      {badgeWidths.map((width, badgeIndex) => (
                        <Skeleton key={`${index}-${badgeIndex}`} h="18px" w={width} borderRadius="full" />
                      ))}
                    </HStack>
                  </Flex>
                  <Skeleton boxSize="20px" borderRadius="sm" flexShrink={0} />
                </Flex>
              ))}
            </Stack>
          </Box>
        </Box>
      </Box>

      <DeletionActionSectionSkeleton titleWidth="208px" descriptionLines={2} actionWidth="104px" />
    </Stack>
  );
}

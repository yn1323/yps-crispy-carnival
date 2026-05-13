import { Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { LuUserCheck, LuX } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { StaffRegistrationRequest } from "../types";

type Props = {
  requests: StaffRegistrationRequest[];
  onApprove: (request: StaffRegistrationRequest) => void;
  onReject: (request: StaffRegistrationRequest) => void;
};

export function PendingStaffRegistrationList({ requests, onApprove, onReject }: Props) {
  if (requests.length === 0) return null;

  return (
    <Box bg="white" borderRadius="lg" borderWidth="1px" borderColor="orange.100" boxShadow="xs" overflow="hidden">
      <Stack gap={0} divideY="1px" divideColor="blackAlpha.50">
        <Flex px={{ base: 4, md: 5 }} py={3} justify="space-between" align="center" gap={3}>
          <HStack gap={2.5} minW={0}>
            <Box color="orange.500" fontSize="lg" flexShrink={0}>
              <LuUserCheck />
            </Box>
            <Heading as="h3" fontSize="sm" fontWeight="bold" color="gray.900">
              スタッフ参加申請
            </Heading>
          </HStack>
          <Text fontSize="xs" color="fg.muted" flexShrink={0}>
            {requests.length}件
          </Text>
        </Flex>

        {requests.map((request) => (
          <Flex
            key={request._id}
            px={{ base: 4, md: 5 }}
            py={3}
            gap={3}
            align={{ base: "stretch", md: "center" }}
            direction={{ base: "column", md: "row" }}
          >
            <Stack gap={0.5} flex={1} minW={0}>
              <Text fontSize="sm" fontWeight="semibold" color="gray.900" truncate>
                {request.name}
              </Text>
              <Text fontSize="xs" color="fg.muted" wordBreak="break-all">
                {request.email}
              </Text>
            </Stack>
            <HStack gap={2} flexShrink={0}>
              <Button size="xs" colorPalette="teal" onClick={() => onApprove(request)}>
                承認
              </Button>
              <Button size="xs" variant="outline" colorPalette="red" gap={1} onClick={() => onReject(request)}>
                <LuX />
                却下
              </Button>
            </HStack>
          </Flex>
        ))}
      </Stack>
    </Box>
  );
}

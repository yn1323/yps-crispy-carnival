import { Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { LuArrowRight, LuUserCheck, LuX } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { StaffRegistrationRequest } from "../types";

type StaffRegistrationRequestBannerProps = {
  requestCount: number;
  onClick: () => void;
};

type StaffRegistrationRequestDialogProps = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  requests: StaffRegistrationRequest[];
  onApprove: (request: StaffRegistrationRequest) => void;
  onReject: (request: StaffRegistrationRequest) => void;
  isApproving?: boolean;
  isRejecting?: boolean;
};

type StaffRegistrationRequestListProps = Pick<
  StaffRegistrationRequestDialogProps,
  "requests" | "onApprove" | "onReject" | "isApproving" | "isRejecting"
>;

export const StaffRegistrationRequestBanner = ({ requestCount, onClick }: StaffRegistrationRequestBannerProps) => (
  <Flex
    bg="white"
    borderRadius="lg"
    borderWidth="1px"
    borderColor="teal.200"
    boxShadow="xs"
    px={{ base: 4, md: 5 }}
    py={{ base: 3.5, md: 4 }}
    gap={{ base: 3, md: 4 }}
    align="center"
    justify="space-between"
  >
    <HStack gap={{ base: 3, md: 4 }} flex={1} minW={0}>
      <Flex
        boxSize={{ base: "40px", md: "48px" }}
        borderRadius="full"
        bg="teal.50"
        color="teal.700"
        borderWidth="1px"
        borderColor="teal.200"
        align="center"
        justify="center"
        flexShrink={0}
      >
        <LuUserCheck size={24} />
      </Flex>
      <Text fontSize="sm" fontWeight="bold" color="gray.900" minW={0}>
        スタッフ参加申請が {requestCount} 件あります
      </Text>
    </HStack>
    <Button variant="outline" colorPalette="teal" size="sm" gap={1.5} flexShrink={0} onClick={onClick}>
      確認する
      <LuArrowRight />
    </Button>
  </Flex>
);

export const StaffRegistrationRequestDialog = ({
  isOpen,
  onOpenChange,
  onClose,
  requests,
  onApprove,
  onReject,
  isApproving = false,
  isRejecting = false,
}: StaffRegistrationRequestDialogProps) => (
  <Dialog
    title="スタッフ参加申請"
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    onClose={onClose}
    footer={
      <Button colorPalette="teal" onClick={onClose}>
        閉じる
      </Button>
    }
    maxW={{ base: "100vw", md: "760px" }}
    maxH={{ base: "100dvh", md: "85dvh" }}
    contentProps={{
      w: "100%",
      h: { base: "100dvh", md: "auto" },
      my: { base: 0, md: "auto" },
      borderRadius: { base: 0, md: "l3" },
    }}
  >
    <Stack gap={3} maxW="760px" w="full" mx="auto">
      <Text fontSize="sm" color="fg.muted">
        承認してシフト提出、共有できるようにしましょう。
      </Text>
      <StaffRegistrationRequestList
        requests={requests}
        onApprove={onApprove}
        onReject={onReject}
        isApproving={isApproving}
        isRejecting={isRejecting}
      />
    </Stack>
  </Dialog>
);

const StaffRegistrationRequestList = ({
  requests,
  onApprove,
  onReject,
  isApproving = false,
  isRejecting = false,
}: StaffRegistrationRequestListProps) => {
  if (requests.length === 0) return null;
  const isBusy = isApproving || isRejecting;

  return (
    <Stack gap={0}>
      {requests.map((request) => (
        <Flex key={request._id} py={3} gap={3} align="center" justify="space-between">
          <Stack gap={0.5} flex={1} minW={0}>
            <Text fontSize="sm" fontWeight="semibold" color="gray.900" truncate>
              {request.name}
            </Text>
            <Text fontSize="xs" color="fg.muted" truncate>
              {request.email}
            </Text>
          </Stack>
          <HStack gap={2} flexShrink={0} justify="flex-end">
            <Button
              aria-label={`${request.name}を承認`}
              size="sm"
              colorPalette="teal"
              loading={isApproving}
              disabled={isBusy}
              onClick={() => onApprove(request)}
            >
              承認
            </Button>
            <Button
              aria-label={`${request.name}を却下`}
              size="sm"
              variant="outline"
              colorPalette="red"
              gap={1}
              loading={isRejecting}
              disabled={isBusy}
              onClick={() => onReject(request)}
            >
              <LuX />
              却下
            </Button>
          </HStack>
        </Flex>
      ))}
    </Stack>
  );
};

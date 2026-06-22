import { Box, Flex, HStack, Stack, Table, Text } from "@chakra-ui/react";
import { LuX } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { formatDateTime } from "@/src/domains/shift/date";
import type { StaffRegistrationRequest } from "../types";

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
      <Button variant="outline" onClick={onClose} w={{ base: "100%", md: "auto" }}>
        閉じる
      </Button>
    }
    maxW={{ base: "100vw", lg: "960px" }}
    maxH={{ base: "100dvh", lg: "82dvh" }}
    contentProps={{
      w: "100%",
      h: { base: "100dvh", lg: "auto" },
      my: { base: 0, lg: "auto" },
      borderRadius: { base: 0, lg: "l3" },
    }}
  >
    <Stack gap={4} w="full">
      <Text fontSize="sm" color="fg.muted">
        承認するとスタッフ登録が完了します。LINE連携案内と、募集中シフトがある場合は提出リンクを送ります。
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
    <>
      <Box
        display={{ base: "none", md: "block" }}
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        overflow="hidden"
      >
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg="gray.50">
              <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="center">
                申請者
              </Table.ColumnHeader>
              <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="center">
                メールアドレス
              </Table.ColumnHeader>
              <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="center">
                申請日時
              </Table.ColumnHeader>
              <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="center" w="176px">
                操作
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {requests.map((request) => (
              <Table.Row key={request._id}>
                <Table.Cell textAlign="center" verticalAlign="middle">
                  <Text fontWeight="semibold" color="gray.900">
                    {request.name}
                  </Text>
                </Table.Cell>
                <Table.Cell textAlign="center" verticalAlign="middle">
                  <Text color="gray.700" maxW="280px" truncate title={request.email}>
                    {request.email}
                  </Text>
                </Table.Cell>
                <Table.Cell color="gray.700" textAlign="center" verticalAlign="middle" whiteSpace="nowrap">
                  {formatDateTime(new Date(request.createdAt))}
                </Table.Cell>
                <Table.Cell textAlign="center" verticalAlign="middle" w="176px">
                  <RequestActionButtons
                    request={request}
                    onApprove={onApprove}
                    onReject={onReject}
                    isApproving={isApproving}
                    isRejecting={isRejecting}
                    isBusy={isBusy}
                  />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      <Stack display={{ base: "flex", md: "none" }} gap={3}>
        {requests.map((request) => (
          <Box key={request._id} borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={4} bg="white">
            <Stack gap={3}>
              <Stack gap={1} minW={0}>
                <Text fontSize="md" fontWeight="bold" color="gray.900" lineHeight="short" truncate>
                  {request.name}
                </Text>
                <Text fontSize="sm" color="gray.700" truncate>
                  {request.email}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  申請日時：{formatDateTime(new Date(request.createdAt))}
                </Text>
              </Stack>

              <Flex justify="flex-end">
                <RequestActionButtons
                  request={request}
                  onApprove={onApprove}
                  onReject={onReject}
                  isApproving={isApproving}
                  isRejecting={isRejecting}
                  isBusy={isBusy}
                  fullWidth
                />
              </Flex>
            </Stack>
          </Box>
        ))}
      </Stack>
    </>
  );
};

const RequestActionButtons = ({
  request,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
  isBusy,
  fullWidth = false,
}: {
  request: StaffRegistrationRequest;
  onApprove: (request: StaffRegistrationRequest) => void;
  onReject: (request: StaffRegistrationRequest) => void;
  isApproving: boolean;
  isRejecting: boolean;
  isBusy: boolean;
  fullWidth?: boolean;
}) => (
  <HStack gap={2} flexShrink={0} justify={fullWidth ? "flex-end" : "center"} w={fullWidth ? "100%" : undefined}>
    <Button
      aria-label={`${request.name}を承認`}
      size="sm"
      colorPalette="teal"
      loading={isApproving}
      disabled={isBusy}
      onClick={() => onApprove(request)}
      flex={fullWidth ? 1 : undefined}
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
      flex={fullWidth ? 1 : undefined}
    >
      <LuX />
      却下
    </Button>
  </HStack>
);

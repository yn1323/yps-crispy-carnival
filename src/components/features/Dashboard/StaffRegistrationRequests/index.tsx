import { Box, Flex, HStack, Stack, Table, Text } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import { LuX } from "react-icons/lu";
import { PeopleCapacityResolutionAlert } from "@/src/components/shared/PeopleCapacityResolutionAlert";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { PeopleCapacityResolution } from "@/src/domains/organizationBilling/peopleCapacity";
import { formatDateTime } from "@/src/domains/shift/date";
import type { StaffRegistrationRequest } from "../types";
import { resolveStaffRegistrationApprovalAvailability } from "./script";

export { resolveStaffRegistrationApprovalAvailability } from "./script";

type StaffRegistrationRequestDialogProps = {
  isOpen: boolean;
  isReadOnly?: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  requests: StaffRegistrationRequest[];
  peopleCapacityResolution?: PeopleCapacityResolution | null;
  onOpenBillingSettings?: () => void;
  onApprove: (request: StaffRegistrationRequest) => void;
  onReject: (request: StaffRegistrationRequest) => void;
  isApproving?: boolean;
  isRejecting?: boolean;
  rejectTarget?: StaffRegistrationRequest | null;
  onRejectClose?: () => void;
  onRejectConfirm?: () => void | Promise<void>;
};

type StaffRegistrationRequestListProps = Pick<
  StaffRegistrationRequestDialogProps,
  "requests" | "onApprove" | "onReject" | "isApproving" | "isRejecting" | "isReadOnly"
>;

export const StaffRegistrationRequestDialog = ({
  isOpen,
  isReadOnly = false,
  onOpenChange,
  onClose,
  requests,
  peopleCapacityResolution = null,
  onOpenBillingSettings,
  onApprove,
  onReject,
  isApproving = false,
  isRejecting = false,
  rejectTarget = null,
  onRejectClose,
  onRejectConfirm,
}: StaffRegistrationRequestDialogProps) => {
  const isConfirmingReject = rejectTarget !== null;
  const rejectTriggerIdRef = useRef<string | null>(null);
  const confirmationBodyRef = useRef<HTMLDivElement>(null);
  const wasConfirmingReject = useRef(false);

  useEffect(() => {
    if (isConfirmingReject) {
      confirmationBodyRef.current?.focus();
    } else if (wasConfirmingReject.current) {
      const trigger = rejectTriggerIdRef.current
        ? document.querySelector<HTMLButtonElement>(
            `[data-registration-reject-trigger="${rejectTriggerIdRef.current}"]`,
          )
        : null;
      trigger?.focus();
    }
    wasConfirmingReject.current = isConfirmingReject;
  }, [isConfirmingReject]);

  const closeCurrentState = () => {
    if (isConfirmingReject) {
      if (!isRejecting) onRejectClose?.();
      return;
    }
    onClose();
  };

  return (
    <Dialog
      title={isConfirmingReject ? "スタッフ登録申請を却下" : "スタッフ登録申請"}
      role={isConfirmingReject ? "alertdialog" : "dialog"}
      isOpen={(isOpen || isConfirmingReject) && !isReadOnly}
      onOpenChange={(details) => {
        if (!details.open && isConfirmingReject) closeCurrentState();
        else onOpenChange(details);
      }}
      onClose={closeCurrentState}
      closeLabel={isConfirmingReject ? "キャンセル" : "閉じる"}
      onSubmit={isConfirmingReject ? onRejectConfirm : undefined}
      submitLabel="この申請を却下"
      submitColorPalette="red"
      isLoading={isRejecting}
      isSubmitDisabled={isReadOnly || rejectTarget === null}
      mobileFullScreen
      maxW={isConfirmingReject ? "480px" : { lg: "960px" }}
      maxH={isConfirmingReject ? undefined : { lg: "82dvh" }}
    >
      {isConfirmingReject ? (
        <Stack
          ref={confirmationBodyRef}
          data-testid="registration-reject-confirmation"
          tabIndex={-1}
          gap={2}
          outline="none"
        >
          <Text>「{rejectTarget.name}」さんのスタッフ登録申請を却下しますか？</Text>
          <Text fontSize="sm" color="gray.600">
            却下してもスタッフには通知されません。
            <br />
            必要な場合はシフト作成担当者から直接案内してください。
          </Text>
        </Stack>
      ) : (
        <Stack gap={4} w="full">
          {peopleCapacityResolution && (
            <PeopleCapacityResolutionAlert
              resolution={peopleCapacityResolution}
              retryActionLabel="申請を承認"
              onOpenBillingSettings={onOpenBillingSettings}
            />
          )}
          <Text fontSize="sm" color="fg.muted">
            承認するとスタッフとして登録されます。
            <br />
            LINE未連携の場合は連携の案内を送り、募集中のシフトがあれば提出リンクも送ります。
          </Text>
          <StaffRegistrationRequestList
            requests={requests}
            isReadOnly={isReadOnly}
            onApprove={onApprove}
            onReject={(request) => {
              rejectTriggerIdRef.current = request._id;
              onReject(request);
            }}
            isApproving={isApproving}
            isRejecting={isRejecting}
          />
        </Stack>
      )}
    </Dialog>
  );
};

const StaffRegistrationRequestList = ({
  requests,
  isReadOnly = false,
  onApprove,
  onReject,
  isApproving = false,
  isRejecting = false,
}: StaffRegistrationRequestListProps) => {
  if (requests.length === 0) return null;
  const isBusy = isReadOnly || isApproving || isRejecting;

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
}) => {
  const approval = resolveStaffRegistrationApprovalAvailability(request);
  const disabledReasonId = approval.canApprove ? undefined : `registration-approve-disabled-${request._id}`;

  return (
    <Stack gap={1} align={fullWidth ? "stretch" : "center"} w={fullWidth ? "100%" : undefined}>
      <HStack gap={2} flexShrink={0} justify={fullWidth ? "flex-end" : "center"} w="100%">
        <Button
          aria-label={`${request.name}を承認`}
          aria-describedby={disabledReasonId}
          size="sm"
          colorPalette="teal"
          loading={isApproving}
          disabled={isBusy || !approval.canApprove}
          onClick={() => {
            if (approval.canApprove) onApprove(request);
          }}
          flex={fullWidth ? 1 : undefined}
        >
          承認
        </Button>
        <Button
          data-registration-reject-trigger={request._id}
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
      {!approval.canApprove && (
        <Text id={disabledReasonId} fontSize="xs" color="fg.muted" textAlign={fullWidth ? "left" : "center"}>
          {approval.disabledReason}
        </Text>
      )}
    </Stack>
  );
};

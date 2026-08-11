import { Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { forwardRef, type ReactNode, type RefObject, useEffect, useRef } from "react";
import type { IconType } from "react-icons";
import { LuChevronLeft, LuChevronRight, LuClipboardPenLine, LuQrCode, LuUsersRound } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { PeopleCapacityResolutionAlert } from "@/src/components/shared/PeopleCapacityResolutionAlert";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { PeopleCapacityResolution } from "@/src/domains/organizationBilling/peopleCapacity";
import type { AddStaffFormData } from "../AddStaffForm";
import { AddStaffForm } from "../AddStaffForm";
import { StaffRegistrationLinkPanel } from "../StaffRegistrationLinkPanel";
import { OrganizationPeopleCandidateList } from "./OrganizationPeopleCandidateList";

type DialogState = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
};

export type StaffInvitationMethod = "link" | "manual" | "organization";

export type StaffInvitationViewModel = {
  dialog: DialogState;
  selectedMethod: StaffInvitationMethod | null;
  showOrganizationPeopleAddition: boolean;
  registrationUrl: string | null;
  registrationUrlError: boolean;
  peopleCapacityResolution: PeopleCapacityResolution | null;
  isRegistrationUrlLoading: boolean;
  isAddingStaffs: boolean;
  addingOrganizationPersonId: Id<"organizationPeople"> | null;
  isAddingOrganizationPerson: boolean;
  onOpen: () => void | Promise<void>;
  onClose: () => void;
  onSelectMethod: (method: StaffInvitationMethod) => void;
  onBackToMethods: () => void;
  onRetryRegistrationUrl: () => void | Promise<void>;
  onAddStaffs: (data: AddStaffFormData) => void | Promise<void>;
  onAddOrganizationPerson: (personId: Id<"organizationPeople">) => void | Promise<void>;
  reactivationConfirmation: {
    dialog: DialogState;
    candidates: Array<{
      personId: Id<"organizationPeople">;
      name: string;
      email: string;
    }>;
    isConfirming: boolean;
    onConfirm: () => void | Promise<void>;
    onClose: () => void;
  };
};

type Props = {
  invitation: StaffInvitationViewModel;
  isReadOnly?: boolean;
};

export function StaffInvitationDialog({ invitation, isReadOnly = false }: Props) {
  return (
    <StaffInvitationDialogView
      invitation={invitation}
      isReadOnly={isReadOnly}
      organizationPeopleContent={getOrganizationPeopleContent(invitation, isReadOnly)}
    />
  );
}

/** Dialogのガワを親で保持する間、遅延読み込みする本文だけを返す。 */
export function StaffInvitationDialogContent({ invitation, isReadOnly = false }: Props) {
  return (
    <StaffInvitationDialogBody
      invitation={invitation}
      organizationPeopleContent={getOrganizationPeopleContent(invitation, isReadOnly)}
    />
  );
}

function getOrganizationPeopleContent(invitation: StaffInvitationViewModel, isReadOnly: boolean) {
  return (
    <OrganizationPeopleCandidateList
      enabled={
        !isReadOnly &&
        invitation.showOrganizationPeopleAddition &&
        invitation.dialog.isOpen &&
        invitation.selectedMethod === "organization"
      }
      isReadOnly={isReadOnly}
      addingPersonId={invitation.addingOrganizationPersonId}
      isAdding={invitation.isAddingOrganizationPerson}
      onAdd={invitation.onAddOrganizationPerson}
    />
  );
}

type ViewProps = Props & {
  organizationPeopleContent: ReactNode;
};

type BodyProps = {
  invitation: StaffInvitationViewModel;
  organizationPeopleContent: ReactNode;
};

export function StaffInvitationDialogView({ invitation, isReadOnly = false, organizationPeopleContent }: ViewProps) {
  const selectedMethod = getSelectedMethod(invitation);
  const isManualMethod = selectedMethod === "manual";
  const isBusy = invitation.isAddingStaffs || invitation.isAddingOrganizationPerson;

  return (
    <Dialog
      title="スタッフを追加"
      isOpen={invitation.dialog.isOpen && !isReadOnly}
      onOpenChange={invitation.dialog.onOpenChange}
      formId={isManualMethod ? "add-staff-form" : undefined}
      onClose={invitation.onClose}
      preventClose={isBusy}
      footer={
        <Flex w="full" align="center" gap={3} wrap="wrap">
          {selectedMethod !== null && (
            <Button variant="outline" onClick={invitation.onBackToMethods} disabled={isBusy}>
              <LuChevronLeft aria-hidden />
              戻る
            </Button>
          )}
          {(isManualMethod || selectedMethod !== "organization") && (
            <Flex ms="auto" align="center" gap={3}>
              <Button variant="outline" onClick={invitation.onClose} disabled={isReadOnly || isBusy}>
                閉じる
              </Button>
              {isManualMethod && (
                <Button
                  type="submit"
                  form="add-staff-form"
                  colorPalette="teal"
                  loading={invitation.isAddingStaffs}
                  disabled={isReadOnly || invitation.isAddingOrganizationPerson}
                >
                  スタッフを登録する
                </Button>
              )}
            </Flex>
          )}
        </Flex>
      }
      maxW={{ base: "100vw", lg: "640px" }}
      maxH={{ base: "100dvh", lg: "85dvh" }}
      contentProps={{
        w: "100%",
        h: { base: "100dvh", lg: "auto" },
        my: { base: 0, lg: "auto" },
        borderRadius: { base: 0, lg: "l3" },
      }}
      bodyProps={{ pt: 0 }}
    >
      <StaffInvitationDialogBody invitation={invitation} organizationPeopleContent={organizationPeopleContent} />
    </Dialog>
  );
}

function getSelectedMethod(invitation: StaffInvitationViewModel) {
  return !invitation.showOrganizationPeopleAddition && invitation.selectedMethod === "organization"
    ? null
    : invitation.selectedMethod;
}

function StaffInvitationDialogBody({ invitation, organizationPeopleContent }: BodyProps) {
  const selectedMethod = getSelectedMethod(invitation);
  const isBusy = invitation.isAddingStaffs || invitation.isAddingOrganizationPerson;
  const methodButtonRefs = useRef<Partial<Record<StaffInvitationMethod, HTMLButtonElement | null>>>({});
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const lastSelectedMethodRef = useRef<StaffInvitationMethod>("link");

  useEffect(() => {
    if (!invitation.dialog.isOpen) return;

    if (selectedMethod) {
      detailHeadingRef.current?.focus();
      return;
    }

    const previousButton = methodButtonRefs.current[lastSelectedMethodRef.current];
    (previousButton ?? methodButtonRefs.current.link)?.focus();
  }, [invitation.dialog.isOpen, selectedMethod]);

  const handleSelectMethod = (method: StaffInvitationMethod) => {
    lastSelectedMethodRef.current = method;
    invitation.onSelectMethod(method);
  };

  return (
    <Stack gap={5} pt={2} minH={0}>
      {selectedMethod === null && (
        <StaffInvitationMethodMenu
          showOrganizationPeopleAddition={invitation.showOrganizationPeopleAddition}
          disabled={isBusy}
          buttonRefs={methodButtonRefs}
          onSelect={handleSelectMethod}
        />
      )}

      {selectedMethod !== null && <StaffInvitationDetailHeader ref={detailHeadingRef} method={selectedMethod} />}

      {selectedMethod === "link" && (
        <Stack gap={6}>
          <StaffRegistrationLinkPanel
            registrationUrl={invitation.registrationUrl}
            isLoading={invitation.isRegistrationUrlLoading}
            hasError={invitation.registrationUrlError}
            onRetry={invitation.onRetryRegistrationUrl}
          />
        </Stack>
      )}

      <Box hidden={selectedMethod !== "manual"}>
        <Stack gap={4}>
          {invitation.peopleCapacityResolution && (
            <PeopleCapacityResolutionAlert
              resolution={invitation.peopleCapacityResolution}
              retryActionLabel="スタッフを追加"
            />
          )}
          <AddStaffForm onSubmit={invitation.onAddStaffs} />
        </Stack>
      </Box>

      {selectedMethod === "organization" && invitation.showOrganizationPeopleAddition && (
        <Box>{organizationPeopleContent}</Box>
      )}
    </Stack>
  );
}

type MethodOption = {
  method: StaffInvitationMethod;
  title: string;
  description: string;
  icon: IconType;
};

const METHOD_OPTIONS: MethodOption[] = [
  {
    method: "link",
    title: "スタッフ本人に登録してもらう",
    description: "QRコードや招待リンクを共有し、スタッフ本人に登録を依頼します。",
    icon: LuQrCode,
  },
  {
    method: "manual",
    title: "管理者が情報を入力して追加する",
    description: "氏名とメールアドレスを入力し、管理者がスタッフを直接追加します。",
    icon: LuClipboardPenLine,
  },
  {
    method: "organization",
    title: "別店舗のスタッフを追加する",
    description: "別の店舗に登録済みのスタッフを、この店舗にも追加します。",
    icon: LuUsersRound,
  },
];

type MethodMenuProps = {
  showOrganizationPeopleAddition: boolean;
  disabled: boolean;
  buttonRefs: RefObject<Partial<Record<StaffInvitationMethod, HTMLButtonElement | null>>>;
  onSelect: (method: StaffInvitationMethod) => void;
};

function StaffInvitationMethodMenu({
  showOrganizationPeopleAddition,
  disabled,
  buttonRefs,
  onSelect,
}: MethodMenuProps) {
  const options = METHOD_OPTIONS.filter(({ method }) => method !== "organization" || showOrganizationPeopleAddition);

  return (
    <Stack gap={4}>
      <Text color="fg.muted" fontSize="sm">
        追加方法を選んでください
      </Text>
      <Stack gap={3}>
        {options.map(({ method, title, description, icon: MethodIcon }) => {
          const titleId = `staff-addition-method-${method}-title`;
          const descriptionId = `staff-addition-method-${method}-description`;

          return (
            <Button
              key={method}
              ref={(node) => {
                buttonRefs.current[method] = node;
              }}
              type="button"
              variant="outline"
              aria-labelledby={titleId}
              aria-describedby={descriptionId}
              disabled={disabled}
              w="full"
              h="auto"
              minH={{ base: "92px", sm: "88px" }}
              px={{ base: 3.5, sm: 4 }}
              py={3.5}
              justifyContent="flex-start"
              textAlign="left"
              whiteSpace="normal"
              bg="white"
              borderColor="border.default"
              borderRadius="xl"
              boxShadow="xs"
              transition="background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease"
              _hover={disabled ? undefined : { bg: "gray.50", borderColor: "gray.300", boxShadow: "sm" }}
              _active={disabled ? undefined : { bg: "gray.100" }}
              _focusVisible={{
                outlineWidth: "2px",
                outlineStyle: "solid",
                outlineColor: "teal.500",
                outlineOffset: "2px",
              }}
              onClick={() => onSelect(method)}
            >
              <HStack gap={3.5} align="center" w="full" minW={0}>
                <Flex
                  boxSize={{ base: "42px", sm: "44px" }}
                  borderRadius="lg"
                  bg="teal.50"
                  color="teal.700"
                  align="center"
                  justify="center"
                  flexShrink={0}
                  fontSize="xl"
                  aria-hidden
                >
                  <MethodIcon />
                </Flex>
                <Stack gap={1} flex={1} minW={0}>
                  <Text id={titleId} fontWeight="semibold" color="gray.900" lineHeight="short">
                    {title}
                  </Text>
                  <Text id={descriptionId} fontSize="sm" color="fg.muted" lineHeight="tall">
                    {description}
                  </Text>
                </Stack>
                <Flex color="gray.400" fontSize="lg" flexShrink={0} aria-hidden>
                  <LuChevronRight />
                </Flex>
              </HStack>
            </Button>
          );
        })}
      </Stack>
    </Stack>
  );
}

const METHOD_TITLES: Record<StaffInvitationMethod, string> = {
  link: "スタッフ本人に登録してもらう",
  manual: "管理者が情報を入力して追加する",
  organization: "別店舗のスタッフを追加する",
};

type DetailHeaderProps = {
  method: StaffInvitationMethod;
};

const StaffInvitationDetailHeader = forwardRef<HTMLHeadingElement, DetailHeaderProps>(({ method }, ref) => (
  <Heading
    ref={ref}
    as="h3"
    fontSize="lg"
    fontWeight="bold"
    color="gray.900"
    tabIndex={-1}
    _focusVisible={{
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: "teal.500",
      outlineOffset: "2px",
    }}
  >
    {METHOD_TITLES[method]}
  </Heading>
));

StaffInvitationDetailHeader.displayName = "StaffInvitationDetailHeader";

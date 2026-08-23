import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import {
  classifyPeopleCapacityError,
  type PeopleCapacityResolution,
} from "@/src/domains/organizationBilling/peopleCapacity";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorMessage } from "@/src/lib/convex/error";
import type { AddStaffFormData } from "../AddStaffForm";
import type { StaffInvitationMethod } from "./StaffInvitationDialog";

export function useStaffInvitation(
  isReadOnly = false,
  showOrganizationPeopleAddition = false,
  onOpenBillingSettings?: () => void,
) {
  const isReadOnlyRef = useRef(isReadOnly);
  const showOrganizationPeopleAdditionRef = useRef(showOrganizationPeopleAddition);
  const invitationMutationInFlightRef = useRef(false);
  const dialogSessionRef = useRef(0);
  const isDialogOpenRef = useRef(false);
  const registrationLinkIdRef = useRef<Id<"shopRegistrationLinks"> | null>(null);
  const registrationUrlRef = useRef<string | null>(null);
  const registrationUrlLoadSessionRef = useRef<number | null>(null);
  const isConfirmingRegistrationLinkRotationRef = useRef(false);
  isReadOnlyRef.current = isReadOnly;
  showOrganizationPeopleAdditionRef.current = showOrganizationPeopleAddition;
  const dialog = useDialog();
  const [selectedMethod, setSelectedMethod] = useState<StaffInvitationMethod | null>(null);
  const [registrationLinkId, setRegistrationLinkId] = useState<Id<"shopRegistrationLinks"> | null>(null);
  const [registrationUrl, setRegistrationUrl] = useState<string | null>(null);
  const [registrationUrlError, setRegistrationUrlError] = useState(false);
  const [isRegistrationUrlLoading, setIsRegistrationUrlLoading] = useState(false);
  const [isConfirmingRegistrationLinkRotation, setIsConfirmingRegistrationLinkRotation] = useState(false);
  const [peopleCapacityResolution, setPeopleCapacityResolution] = useState<PeopleCapacityResolution | null>(null);
  const [addingOrganizationPersonId, setAddingOrganizationPersonId] = useState<Id<"organizationPeople"> | null>(null);
  const addStaffs = useShopMutation(api.staff.mutations.addStaffs);
  const addOrganizationPersonToShop = useShopMutation(api.staff.mutations.addOrganizationPersonToShop);
  const ensureShopRegistrationLink = useShopMutation(api.staffRegistration.mutations.ensureShopRegistrationLink);
  const rotateShopRegistrationLink = useShopMutation(api.staffRegistration.mutations.rotateShopRegistrationLink);

  const closeDialogSession = useCallback(() => {
    dialogSessionRef.current += 1;
    isDialogOpenRef.current = false;
    registrationUrlLoadSessionRef.current = null;
    registrationLinkIdRef.current = null;
    registrationUrlRef.current = null;
    setSelectedMethod(null);
    setRegistrationLinkId(null);
    setRegistrationUrl(null);
    setRegistrationUrlError(false);
    setIsRegistrationUrlLoading(false);
    isConfirmingRegistrationLinkRotationRef.current = false;
    setIsConfirmingRegistrationLinkRotation(false);
    dialog.close();
  }, [dialog.close]);

  useEffect(() => {
    if (!isReadOnly) return;
    closeDialogSession();
    setPeopleCapacityResolution(null);
    setAddingOrganizationPersonId(null);
  }, [closeDialogSession, isReadOnly]);

  useEffect(() => {
    if (showOrganizationPeopleAddition) return;
    setSelectedMethod((current) => (current === "organization" ? null : current));
    setAddingOrganizationPersonId(null);
  }, [showOrganizationPeopleAddition]);

  const { run: handleAddStaffs, isRunning: isAddingStaffs } = useSingleFlight(async (data: AddStaffFormData) => {
    if (isReadOnlyRef.current || invitationMutationInFlightRef.current) return;
    invitationMutationInFlightRef.current = true;
    setPeopleCapacityResolution(null);
    try {
      const requestId = crypto.randomUUID();
      const result = await addStaffs({ entries: data.entries, requestId });
      if ((result as { status: string }).status !== "added") {
        throw new Error("スタッフ追加の処理が更新されました。画面を再読み込みして、もう一度お試しください。");
      }
      closeDialogSession();
      showSuccessToast({
        title: "スタッフを追加しました",
        description: "必要な案内通知の送信を受け付けました。\n募集中のシフトがある場合は、提出リンクも送信します。",
      });
    } catch (error) {
      const resolution = classifyPeopleCapacityError(getConvexErrorMessage(error));
      if (resolution) {
        setPeopleCapacityResolution(resolution);
        return;
      }
      showErrorToast(error);
    } finally {
      invitationMutationInFlightRef.current = false;
    }
  });

  const loadRegistrationUrlForSession = useCallback(
    async (sessionId: number) => {
      if (
        isReadOnlyRef.current ||
        !isDialogOpenRef.current ||
        dialogSessionRef.current !== sessionId ||
        (registrationLinkIdRef.current && registrationUrlRef.current) ||
        registrationUrlLoadSessionRef.current === sessionId
      ) {
        return;
      }

      registrationUrlLoadSessionRef.current = sessionId;
      setRegistrationUrlError(false);
      setIsRegistrationUrlLoading(true);

      const isCurrentSession = () =>
        !isReadOnlyRef.current && isDialogOpenRef.current && dialogSessionRef.current === sessionId;

      try {
        const result = await ensureShopRegistrationLink({});
        if (!isCurrentSession()) return;
        registrationLinkIdRef.current = result.linkId;
        registrationUrlRef.current = result.registrationUrl;
        setRegistrationLinkId(result.linkId);
        setRegistrationUrl(result.registrationUrl);
        setRegistrationUrlError(false);
      } catch {
        if (!isCurrentSession()) return;
        registrationLinkIdRef.current = null;
        registrationUrlRef.current = null;
        setRegistrationLinkId(null);
        setRegistrationUrl(null);
        setRegistrationUrlError(true);
      } finally {
        if (registrationUrlLoadSessionRef.current === sessionId) {
          registrationUrlLoadSessionRef.current = null;
          if (isCurrentSession()) setIsRegistrationUrlLoading(false);
        }
      }
    },
    [ensureShopRegistrationLink],
  );

  const handleSelectMethod = (method: StaffInvitationMethod) => {
    if (
      isReadOnlyRef.current ||
      !isDialogOpenRef.current ||
      isConfirmingRegistrationLinkRotationRef.current ||
      invitationMutationInFlightRef.current
    ) {
      return;
    }
    if (method === "organization" && !showOrganizationPeopleAdditionRef.current) return;

    setPeopleCapacityResolution(null);
    setSelectedMethod(method);
    if (method === "link" && (!registrationLinkIdRef.current || !registrationUrlRef.current)) {
      void loadRegistrationUrlForSession(dialogSessionRef.current);
    }
  };

  const handleBackToMethods = () => {
    if (
      isReadOnlyRef.current ||
      !isDialogOpenRef.current ||
      isConfirmingRegistrationLinkRotationRef.current ||
      invitationMutationInFlightRef.current
    ) {
      return;
    }
    setPeopleCapacityResolution(null);
    setSelectedMethod(null);
  };

  const handleRetryRegistrationUrl = () => {
    if (
      isReadOnlyRef.current ||
      !isDialogOpenRef.current ||
      selectedMethod !== "link" ||
      isConfirmingRegistrationLinkRotationRef.current ||
      invitationMutationInFlightRef.current
    ) {
      return;
    }
    void loadRegistrationUrlForSession(dialogSessionRef.current);
  };

  const handleRequestRegistrationLinkRotation = () => {
    if (
      isReadOnlyRef.current ||
      !isDialogOpenRef.current ||
      selectedMethod !== "link" ||
      !registrationLinkIdRef.current ||
      invitationMutationInFlightRef.current
    ) {
      return;
    }
    isConfirmingRegistrationLinkRotationRef.current = true;
    setIsConfirmingRegistrationLinkRotation(true);
  };

  const handleCancelRegistrationLinkRotation = () => {
    if (invitationMutationInFlightRef.current) return;
    isConfirmingRegistrationLinkRotationRef.current = false;
    setIsConfirmingRegistrationLinkRotation(false);
  };

  const { run: handleRotateRegistrationLink, isRunning: isRotatingRegistrationLink } = useSingleFlight(async () => {
    const expectedLinkId = registrationLinkIdRef.current;
    if (
      isReadOnlyRef.current ||
      !isDialogOpenRef.current ||
      selectedMethod !== "link" ||
      !isConfirmingRegistrationLinkRotationRef.current ||
      !expectedLinkId ||
      invitationMutationInFlightRef.current
    ) {
      return;
    }

    const sessionId = dialogSessionRef.current;
    invitationMutationInFlightRef.current = true;
    const isCurrentSession = () =>
      !isReadOnlyRef.current && isDialogOpenRef.current && dialogSessionRef.current === sessionId;

    try {
      const result = await rotateShopRegistrationLink({ expectedLinkId });
      if (!isCurrentSession()) return;

      registrationLinkIdRef.current = result.linkId;
      registrationUrlRef.current = result.registrationUrl;
      setRegistrationLinkId(result.linkId);
      setRegistrationUrl(result.registrationUrl);
      setRegistrationUrlError(false);
      isConfirmingRegistrationLinkRotationRef.current = false;
      setIsConfirmingRegistrationLinkRotation(false);

      if (result.status === "rotated") {
        showSuccessToast({ title: "登録リンクを再発行しました" });
      }
    } catch (error) {
      if (isCurrentSession()) showErrorToast(error);
    } finally {
      invitationMutationInFlightRef.current = false;
    }
  });

  const { run: handleAddOrganizationPerson, isRunning: isAddingOrganizationPerson } = useSingleFlight(
    async (personId: Id<"organizationPeople">) => {
      if (isReadOnlyRef.current || !showOrganizationPeopleAdditionRef.current || invitationMutationInFlightRef.current)
        return;

      invitationMutationInFlightRef.current = true;
      setAddingOrganizationPersonId(personId);
      try {
        await addOrganizationPersonToShop({ personId, requestId: crypto.randomUUID() });
        if (isReadOnlyRef.current || !showOrganizationPeopleAdditionRef.current) return;
        closeDialogSession();
        showSuccessToast({
          title: "スタッフを追加しました",
          description: "この店舗のスタッフとして追加しました。",
        });
      } catch (error) {
        if (!isReadOnlyRef.current && showOrganizationPeopleAdditionRef.current) showErrorToast(error);
      } finally {
        setAddingOrganizationPersonId(null);
        invitationMutationInFlightRef.current = false;
      }
    },
  );

  const handleOpen = () => {
    if (isReadOnlyRef.current || invitationMutationInFlightRef.current) return;
    dialogSessionRef.current += 1;
    isDialogOpenRef.current = true;
    registrationUrlLoadSessionRef.current = null;
    registrationLinkIdRef.current = null;
    registrationUrlRef.current = null;
    setSelectedMethod(null);
    setRegistrationLinkId(null);
    setRegistrationUrl(null);
    setRegistrationUrlError(false);
    setIsRegistrationUrlLoading(false);
    isConfirmingRegistrationLinkRotationRef.current = false;
    setIsConfirmingRegistrationLinkRotation(false);
    setPeopleCapacityResolution(null);
    setAddingOrganizationPersonId(null);
    dialog.open();
  };

  const handleClose = () => {
    if (invitationMutationInFlightRef.current) return;
    closeDialogSession();
  };

  return {
    dialog: {
      isOpen: dialog.isOpen,
      onOpenChange: ({ open }: { open: boolean }) => {
        if (open) {
          handleOpen();
          return;
        }
        handleClose();
      },
    },
    selectedMethod,
    showOrganizationPeopleAddition,
    registrationLinkId,
    registrationUrl,
    registrationUrlError,
    peopleCapacityResolution,
    isRegistrationUrlLoading,
    isConfirmingRegistrationLinkRotation,
    isRotatingRegistrationLink,
    isAddingStaffs,
    addingOrganizationPersonId,
    isAddingOrganizationPerson,
    onOpen: handleOpen,
    onClose: handleClose,
    onSelectMethod: handleSelectMethod,
    onBackToMethods: handleBackToMethods,
    onRetryRegistrationUrl: handleRetryRegistrationUrl,
    onRequestRegistrationLinkRotation: handleRequestRegistrationLinkRotation,
    onCancelRegistrationLinkRotation: handleCancelRegistrationLinkRotation,
    onRotateRegistrationLink: handleRotateRegistrationLink,
    onAddStaffs: handleAddStaffs,
    onAddOrganizationPerson: handleAddOrganizationPerson,
    onOpenBillingSettings,
  };
}

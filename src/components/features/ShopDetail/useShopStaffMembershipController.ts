import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorMessage } from "@/src/lib/convex/error";
import type {
  ShopStaffMembershipChangeInput,
  ShopStaffMembershipData,
  ShopStaffMembershipRemovalPreview,
} from "./types";

const STALE_RELOAD_MESSAGE =
  "スタッフの所属または今日以降のシフトが変更されました。画面を再読み込みして、もう一度お試しください。";
const DEFAULT_ERROR_MESSAGE = "変更を完了できませんでした。通信状態を確認して、もう一度お試しください。";
const UNKNOWN_RESULT_MESSAGE = "変更結果を確認できませんでした。内容を変えずに、もう一度「変更する」を押してください。";
const SAFE_REJECTION_MESSAGE_PARTS = [
  "利用人数が現在のプラン上限を超えます",
  "一括で所属を変更できません",
  "変更操作が続いています",
  "一度に変更できるスタッフは",
  "管理者招待が多いため",
  "募集中のシフト提出状況を安全に更新できません",
  "所属スタッフを確認できません",
  "スタッフの追加対象が変更されています",
  "スタッフの追加結果を確認できません",
] as const;
type ShopId = NonNullable<ShopStaffMembershipChangeInput["shopId"]>;

export type ShopStaffMembershipSubmitResult = "succeeded" | "unknown" | "rejected";

type PreviewRequest = {
  shopId: ShopId;
  personIds: ShopStaffMembershipData["people"][number]["personId"][];
  expectedMembershipFingerprint: string;
  now: number;
};

type Options = {
  shopId: ShopId;
  isOpen: boolean;
  onSucceeded: () => void;
};

export function useShopStaffMembershipController({ shopId, isOpen, onSucceeded }: Options) {
  const membershipData = useQuery(
    api.staff.queries.getOrganizationShopStaffMembershipChange,
    isOpen ? { shopId } : "skip",
  );
  const [previewRequest, setPreviewRequest] = useState<PreviewRequest | null>(null);
  const removalPreview = useQuery(
    api.staff.queries.previewOrganizationShopStaffMembershipRemovals,
    isOpen && previewRequest ? previewRequest : "skip",
  );
  const [retainedRemovalPreview, setRetainedRemovalPreview] = useState<
    ShopStaffMembershipRemovalPreview | null | undefined
  >();
  const changeMemberships = useMutation(api.staff.mutations.changeOrganizationShopStaffMemberships);
  const [errorMessage, setErrorMessage] = useState<string>();
  const latestStateRef = useRef({ isOpen, membershipData, shopId });
  const onSucceededRef = useRef(onSucceeded);
  const lastSubmittedInputRef = useRef<string | undefined>(undefined);
  const isMountedRef = useRef(false);
  latestStateRef.current = { isOpen, membershipData, shopId };
  onSucceededRef.current = onSucceeded;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) return;
    setPreviewRequest(null);
    setRetainedRemovalPreview(undefined);
    setErrorMessage(undefined);
    lastSubmittedInputRef.current = undefined;
  }, [isOpen]);

  useEffect(() => {
    if (previewRequest && removalPreview !== undefined) {
      setRetainedRemovalPreview(removalPreview);
    }
  }, [previewRequest, removalPreview]);

  const clearPreview = useCallback(() => {
    setPreviewRequest(null);
    setRetainedRemovalPreview(undefined);
  }, []);
  const clearError = useCallback(() => setErrorMessage(undefined), []);

  const requestRemovalPreview = useCallback(
    (personIds: PreviewRequest["personIds"], expectedMembershipFingerprint: string) => {
      const current = latestStateRef.current;
      if (
        !current.isOpen ||
        current.shopId !== shopId ||
        !current.membershipData ||
        !current.membershipData.canWrite ||
        current.membershipData.membershipFingerprint !== expectedMembershipFingerprint
      ) {
        setErrorMessage(STALE_RELOAD_MESSAGE);
        return false;
      }

      setErrorMessage(undefined);
      setRetainedRemovalPreview(undefined);
      setPreviewRequest({
        shopId,
        personIds,
        expectedMembershipFingerprint,
        now: Date.now(),
      });
      return true;
    },
    [shopId],
  );

  const { run: submitChange, isRunning: isChanging } = useSingleFlight(
    async (input: ShopStaffMembershipChangeInput): Promise<ShopStaffMembershipSubmitResult> => {
      const current = latestStateRef.current;
      const serializedInput = JSON.stringify(input);
      const isExactRetry = lastSubmittedInputRef.current === serializedInput;
      if (
        !current.isOpen ||
        current.shopId !== input.shopId ||
        !current.membershipData ||
        !current.membershipData.canWrite ||
        (current.membershipData.membershipFingerprint !== input.expectedMembershipFingerprint && !isExactRetry)
      ) {
        setErrorMessage(STALE_RELOAD_MESSAGE);
        return "rejected";
      }

      setErrorMessage(undefined);
      // mutationで所属が変わる前に、古いfingerprintのpreview購読を解除する。
      // 確認画面にはretainedRemovalPreviewを残し、処理中の表示を維持する。
      setPreviewRequest(null);
      try {
        await changeMemberships(input);
        const latest = latestStateRef.current;
        if (isMountedRef.current && latest.isOpen && latest.shopId === input.shopId) {
          showSuccessToast({ title: "所属スタッフを変更しました" });
          onSucceededRef.current();
        }
        return "succeeded";
      } catch (error) {
        if (isDefiniteMutationRejection(error)) {
          if (lastSubmittedInputRef.current === serializedInput) lastSubmittedInputRef.current = undefined;
          if (isMountedRef.current) setErrorMessage(toMembershipChangeErrorMessage(error));
          return "rejected";
        }
        lastSubmittedInputRef.current = serializedInput;
        if (isMountedRef.current) setErrorMessage(UNKNOWN_RESULT_MESSAGE);
        return "unknown";
      }
    },
  );

  return {
    data: membershipData as ShopStaffMembershipData | null | undefined,
    removalPreview:
      removalPreview === undefined
        ? retainedRemovalPreview
        : (removalPreview as ShopStaffMembershipRemovalPreview | null),
    isPreviewLoading: previewRequest !== null && removalPreview === undefined,
    isChanging,
    errorMessage,
    requestRemovalPreview,
    clearPreview,
    clearError,
    submitChange,
  };
}

function toMembershipChangeErrorMessage(error: unknown) {
  const message = getConvexErrorMessage(error);
  if (
    message?.includes("店舗所属が変更されています") ||
    message?.includes("削除対象のシフトが変更されています") ||
    message?.includes("今日以降のシフトの割り当てが変更されました")
  ) {
    return STALE_RELOAD_MESSAGE;
  }
  if (message && SAFE_REJECTION_MESSAGE_PARTS.some((part) => message.includes(part))) return message;
  return DEFAULT_ERROR_MESSAGE;
}

function isDefiniteMutationRejection(error: unknown) {
  return (
    error instanceof ConvexError ||
    (typeof error === "object" &&
      error !== null &&
      "data" in error &&
      typeof (error as { data?: unknown }).data === "string")
  );
}

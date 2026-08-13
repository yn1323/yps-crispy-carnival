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
const UNKNOWN_RESULT_MESSAGE = "変更結果を確認できませんでした。内容を変えずに、このままもう一度お試しください。";
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
type RemovalPersonId = ShopStaffMembershipData["people"][number]["personId"];
type ReadyRemovalPreview = Extract<ShopStaffMembershipRemovalPreview, { kind: "ready" }>;
type TooManyRemovalPreview = Extract<ShopStaffMembershipRemovalPreview, { kind: "tooMany" }>;
type StaleRemovalPreview = Extract<ShopStaffMembershipRemovalPreview, { kind: "stale" }>;

export type ShopStaffMembershipSubmitResult = "succeeded" | "unknown" | "rejected";

export type ShopStaffMembershipRemovalPreviewState =
  | { kind: "idle" }
  | { kind: "loading"; key: string }
  | { kind: "ready"; key: string; preview: ReadyRemovalPreview }
  | { kind: "tooMany"; key: string; preview: TooManyRemovalPreview }
  | { kind: "stale"; key: string; preview: StaleRemovalPreview | null };

type PreviewRequest = {
  key: string;
  shopId: ShopId;
  personIds: RemovalPersonId[];
  expectedMembershipFingerprint: string;
  now: number;
};

type RetainedReadyRemovalPreview = {
  key: string;
  preview: ReadyRemovalPreview;
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
  const queriedRemovalPreview = useQuery(
    api.staff.queries.previewOrganizationShopStaffMembershipRemovals,
    isOpen && previewRequest
      ? {
          shopId: previewRequest.shopId,
          personIds: previewRequest.personIds,
          expectedMembershipFingerprint: previewRequest.expectedMembershipFingerprint,
          now: previewRequest.now,
        }
      : "skip",
  );
  const [retainedReadyRemovalPreview, setRetainedReadyRemovalPreview] = useState<RetainedReadyRemovalPreview>();
  const removalPreviewState = resolveRemovalPreviewState({
    isOpen,
    previewRequest,
    queriedRemovalPreview: queriedRemovalPreview as ShopStaffMembershipRemovalPreview | null | undefined,
    retainedReadyRemovalPreview,
  });
  const changeMemberships = useMutation(api.staff.mutations.changeOrganizationShopStaffMemberships);
  const [errorMessage, setErrorMessage] = useState<string>();
  const latestStateRef = useRef({ isOpen, membershipData, removalPreviewState, shopId });
  const onSucceededRef = useRef(onSucceeded);
  const lastSubmittedInputRef = useRef<string | undefined>(undefined);
  const isMountedRef = useRef(false);
  latestStateRef.current = { isOpen, membershipData, removalPreviewState, shopId };
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
    setRetainedReadyRemovalPreview(undefined);
    setErrorMessage(undefined);
    lastSubmittedInputRef.current = undefined;
  }, [isOpen]);

  useEffect(() => {
    if (!previewRequest || queriedRemovalPreview === undefined) return;
    if (queriedRemovalPreview === null || queriedRemovalPreview.kind === "stale") {
      setErrorMessage((current) => current ?? STALE_RELOAD_MESSAGE);
    }
  }, [previewRequest, queriedRemovalPreview]);

  const clearRemovalPreview = useCallback(() => {
    setPreviewRequest(null);
    setRetainedReadyRemovalPreview(undefined);
  }, []);
  const clearError = useCallback(() => setErrorMessage(undefined), []);

  const ensureRemovalPreview = useCallback(
    (personIds: PreviewRequest["personIds"], expectedMembershipFingerprint: string) => {
      const current = latestStateRef.current;
      if (
        !current.isOpen ||
        current.shopId !== shopId ||
        !current.membershipData ||
        !current.membershipData.canWrite ||
        current.membershipData.membershipFingerprint !== expectedMembershipFingerprint
      ) {
        setErrorMessage((message) => message ?? STALE_RELOAD_MESSAGE);
        return false;
      }

      const sortedPersonIds = [...personIds].sort((left, right) => left.localeCompare(right));
      const key = buildShopStaffRemovalPreviewKey(sortedPersonIds, expectedMembershipFingerprint);
      if (current.removalPreviewState.kind !== "idle" && current.removalPreviewState.key === key) return true;

      const nextRequest: PreviewRequest = {
        key,
        shopId,
        personIds: sortedPersonIds,
        expectedMembershipFingerprint,
        now: Date.now(),
      };
      setRetainedReadyRemovalPreview((retained) => (retained?.key === key ? retained : undefined));
      setPreviewRequest((request) => (request?.key === key ? request : nextRequest));
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
      // 結果不明時に同一intentを再試行できるよう、送信内容と一致するready previewだけを保持する。
      const submittedPreviewKey =
        input.removalPreviews.length > 0
          ? buildShopStaffRemovalPreviewKey(
              input.removalPreviews.map((preview) => preview.personId),
              input.expectedMembershipFingerprint,
            )
          : null;
      if (current.removalPreviewState.kind === "ready" && current.removalPreviewState.key === submittedPreviewKey) {
        setRetainedReadyRemovalPreview({
          key: current.removalPreviewState.key,
          preview: current.removalPreviewState.preview,
        });
      } else if (!isExactRetry) {
        setRetainedReadyRemovalPreview(undefined);
      }
      setPreviewRequest(null);
      try {
        await changeMemberships(input);
        if (isMountedRef.current) setRetainedReadyRemovalPreview(undefined);
        const latest = latestStateRef.current;
        if (isMountedRef.current && latest.isOpen && latest.shopId === input.shopId) {
          showSuccessToast({ title: "所属スタッフを変更しました" });
          onSucceededRef.current();
        }
        return "succeeded";
      } catch (error) {
        if (isDefiniteMutationRejection(error)) {
          if (lastSubmittedInputRef.current === serializedInput) lastSubmittedInputRef.current = undefined;
          if (isMountedRef.current) {
            setRetainedReadyRemovalPreview(undefined);
            setErrorMessage(toMembershipChangeErrorMessage(error));
          }
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
    removalPreviewState,
    isChanging,
    errorMessage,
    ensureRemovalPreview,
    clearRemovalPreview,
    clearError,
    submitChange,
  };
}

export function buildShopStaffRemovalPreviewKey(
  personIds: readonly RemovalPersonId[],
  expectedMembershipFingerprint: string,
) {
  return JSON.stringify([
    expectedMembershipFingerprint,
    [...personIds].sort((left, right) => left.localeCompare(right)),
  ]);
}

function resolveRemovalPreviewState({
  isOpen,
  previewRequest,
  queriedRemovalPreview,
  retainedReadyRemovalPreview,
}: {
  isOpen: boolean;
  previewRequest: PreviewRequest | null;
  queriedRemovalPreview: ShopStaffMembershipRemovalPreview | null | undefined;
  retainedReadyRemovalPreview: RetainedReadyRemovalPreview | undefined;
}): ShopStaffMembershipRemovalPreviewState {
  if (!isOpen) return { kind: "idle" };
  if (!previewRequest) {
    return retainedReadyRemovalPreview
      ? { kind: "ready", key: retainedReadyRemovalPreview.key, preview: retainedReadyRemovalPreview.preview }
      : { kind: "idle" };
  }
  if (queriedRemovalPreview === undefined) {
    return { kind: "loading", key: previewRequest.key };
  }
  if (queriedRemovalPreview === null || queriedRemovalPreview.kind === "stale") {
    return { kind: "stale", key: previewRequest.key, preview: queriedRemovalPreview };
  }
  if (queriedRemovalPreview.kind === "ready") {
    return { kind: "ready", key: previewRequest.key, preview: queriedRemovalPreview };
  }
  return { kind: "tooMany", key: previewRequest.key, preview: queriedRemovalPreview };
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

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type ActionInboxQueryResult = FunctionReturnType<typeof api.appOrganization.actionInboxQueries.getActionInbox>;
export type ActionInboxSourceItem = ActionInboxQueryResult["items"][number];
export type ActionInboxSourceKind = ActionInboxSourceItem["kind"];

type LoadRequest = {
  key: number;
  kind: ActionInboxSourceKind;
  cursor: string;
};

type PaginationOverride = {
  cursor?: string;
  hasMore: boolean;
};

export function useActionInboxData({
  organizationId,
  shopFilter,
}: {
  organizationId: Id<"organizations">;
  shopFilter: "all" | Id<"shops">;
}) {
  const [refreshBucket, setRefreshBucket] = useState(0);
  const [loadRequest, setLoadRequest] = useState<LoadRequest | null>(null);
  const [extraItems, setExtraItems] = useState<readonly ActionInboxSourceItem[]>([]);
  const [paginationOverrides, setPaginationOverrides] = useState<
    Partial<Record<ActionInboxSourceKind, PaginationOverride>>
  >({});
  const requestSequenceRef = useRef(0);
  const processedRequestKeyRef = useRef<number | null>(null);

  const discardAdditionalPages = useCallback(() => {
    setExtraItems([]);
    setPaginationOverrides({});
    setLoadRequest(null);
    processedRequestKeyRef.current = null;
  }, []);
  const refresh = useCallback(() => {
    discardAdditionalPages();
    setRefreshBucket((current) => current + 1);
  }, [discardAdditionalPages]);

  const initial = useQuery(api.appOrganization.actionInboxQueries.getActionInbox, {
    organizationId,
    shopFilter,
    refreshBucket,
  });
  const additional = useQuery(
    api.appOrganization.actionInboxQueries.getActionInbox,
    loadRequest
      ? {
          organizationId,
          shopFilter,
          refreshBucket,
          loadMore: { kind: loadRequest.kind, cursor: loadRequest.cursor },
        }
      : "skip",
  );
  const retainedInitialRef = useRef<ActionInboxQueryResult | undefined>(undefined);
  if (initial !== undefined) retainedInitialRef.current = initial;
  const displayedInitial = initial ?? retainedInitialRef.current;

  const scopeSignature = `${organizationId}:${shopFilter}:${initial?.items.map((item) => item.id).join("|") ?? "loading"}`;
  const previousScopeSignatureRef = useRef(scopeSignature);
  useEffect(() => {
    if (previousScopeSignatureRef.current === scopeSignature) return;
    previousScopeSignatureRef.current = scopeSignature;
    discardAdditionalPages();
  }, [discardAdditionalPages, scopeSignature]);

  useEffect(() => {
    if (!loadRequest || !additional || processedRequestKeyRef.current === loadRequest.key) return;
    processedRequestKeyRef.current = loadRequest.key;
    const kind = loadRequest.kind;
    setExtraItems((current) => mergeActionItems(current, additional.items));
    setPaginationOverrides((current) => ({
      ...current,
      [kind]: {
        cursor: additional.continuationByKind[kind],
        hasMore: additional.hasMoreByKind[kind] === true,
      },
    }));
    setLoadRequest(null);
  }, [additional, loadRequest]);

  useEffect(() => {
    const nextRefreshAt = initial?.nextRefreshAt;
    if (nextRefreshAt === undefined) return;
    const delay = Math.max(0, nextRefreshAt - Date.now() + 50);
    const timerId = window.setTimeout(refresh, delay);
    return () => window.clearTimeout(timerId);
  }, [initial?.nextRefreshAt, refresh]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh]);

  const items = useMemo(
    () => (displayedInitial ? mergeActionItems(displayedInitial.items, extraItems).sort(compareActionItems) : []),
    [displayedInitial, extraItems],
  );
  const nextKind = initial ? findNextKind(initial, paginationOverrides) : null;

  return {
    isLoading: displayedInitial === undefined,
    items,
    isLoadingMore: loadRequest !== null,
    canLoadMore: nextKind !== null,
    refresh,
    loadMore: () => {
      if (!initial || loadRequest || !nextKind) return;
      const override = paginationOverrides[nextKind];
      const cursor = override?.cursor ?? initial.continuationByKind[nextKind];
      if (!cursor) return;
      requestSequenceRef.current += 1;
      setLoadRequest({ key: requestSequenceRef.current, kind: nextKind, cursor });
    },
  };
}

const ACTION_KINDS: readonly ActionInboxSourceKind[] = [
  "shift",
  "staffRegistration",
  "notificationFailure",
  "managerInvitation",
];

function findNextKind(
  initial: ActionInboxQueryResult,
  overrides: Partial<Record<ActionInboxSourceKind, PaginationOverride>>,
): ActionInboxSourceKind | null {
  for (const kind of ACTION_KINDS) {
    if (overrides[kind]?.hasMore ?? initial.hasMoreByKind[kind] === true) return kind;
  }
  return null;
}

function mergeActionItems(
  current: readonly ActionInboxSourceItem[],
  additions: readonly ActionInboxSourceItem[],
): ActionInboxSourceItem[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of additions) byId.set(item.id, item);
  return [...byId.values()];
}

function compareActionItems(left: ActionInboxSourceItem, right: ActionInboxSourceItem) {
  const priority: Record<ActionInboxSourceKind, number> = {
    shift: 0,
    staffRegistration: 1,
    notificationFailure: 2,
    managerInvitation: 3,
  };
  return (
    priority[left.kind] - priority[right.kind] || right.occurredAt - left.occurredAt || left.id.localeCompare(right.id)
  );
}

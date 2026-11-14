import { usePaginatedQuery, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AppFeatureRequestShop } from "@/src/components/features/FeatureRequestDialog/appScope";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { setManagerMeasurementOrganization } from "@/src/lib/webMeasurement";
import type { AppOrganizationState } from "./AppOrganizationStateView";
import {
  clearAppOrganizationHint,
  readAppOrganizationHint,
  resolveBrowserLocalStorage,
  writeAppOrganizationHint,
} from "./organizationHint";

const PAGE_SIZE = 50;

export type AppOrganizationScope = {
  organizationId: Id<"organizations">;
  organizationName: string;
  organizationPlan: "trial" | "free" | "standard" | "pro";
  /** nullの間は全cursorを走査中。Headerの組織切替へ部分的な一覧を公開しない。 */
  organizations: AppOrganizationOption[] | null;
  /** nullの間は全cursorを走査中。部分的な店舗一覧を選択肢として公開しない。 */
  shops: AppFeatureRequestShop[] | null;
};

export type AppOrganizationOption = {
  id: Id<"organizations">;
  name: string;
};

type Props = {
  requestedOrganizationId?: string;
  onCanonicalOrganizationResolved: (organizationId: Id<"organizations">) => void;
  renderState: (state: AppOrganizationState) => ReactNode;
  children: ReactNode;
};

const AppOrganizationScopeContext = createContext<AppOrganizationScope | null>(null);

export function useAppOrganizationScope(): AppOrganizationScope {
  const scope = useContext(AppOrganizationScopeContext);
  if (!scope) throw new Error("useAppOrganizationScope must be used inside AppOrganizationScopeProvider");
  return scope;
}

export function AppOrganizationScopeProvider({
  requestedOrganizationId,
  onCanonicalOrganizationResolved,
  renderState,
  children,
}: Props) {
  // URLに組織がない起動では、前回の組織を候補にして組織解決の往復を省く。
  // 候補はserverの検証を通り、URLへ反映されるまで子treeへ公開しない。
  const [organizationHint, setOrganizationHint] = useState(() => readAppOrganizationHint(resolveBrowserLocalStorage()));
  const hintedOrganizationId = requestedOrganizationId === undefined ? organizationHint : undefined;
  const organizationId = requestedOrganizationId ?? hintedOrganizationId;

  const rememberOrganization = useCallback(
    (verifiedOrganizationId: Id<"organizations">) => {
      writeAppOrganizationHint(resolveBrowserLocalStorage(), verifiedOrganizationId);
      setOrganizationHint(verifiedOrganizationId);
      if (requestedOrganizationId === undefined) onCanonicalOrganizationResolved(verifiedOrganizationId);
    },
    [onCanonicalOrganizationResolved, requestedOrganizationId],
  );
  const forgetOrganization = useCallback((inaccessibleOrganizationId: string) => {
    const storage = resolveBrowserLocalStorage();
    if (readAppOrganizationHint(storage) === inaccessibleOrganizationId) clearAppOrganizationHint(storage);
    setOrganizationHint((current) => (current === inaccessibleOrganizationId ? undefined : current));
  }, []);

  return (
    <ErrorBoundary
      key={organizationId ?? "canonical-organization"}
      fallback={(error) => {
        const reason = resolveAppOrganizationErrorReason(error, organizationId !== undefined);
        if (hintedOrganizationId && reason === "inaccessible") {
          return (
            <InaccessibleOrganizationHint organizationId={hintedOrganizationId} onInaccessible={forgetOrganization}>
              {renderState({ kind: "loading" })}
            </InaccessibleOrganizationHint>
          );
        }
        return renderState({ kind: "error", reason });
      }}
    >
      {organizationId ? (
        <VerifiedOrganizationScope
          organizationId={organizationId}
          source={hintedOrganizationId ? "hint" : "url"}
          onVerified={rememberOrganization}
          onInaccessible={forgetOrganization}
          renderState={renderState}
        >
          {children}
        </VerifiedOrganizationScope>
      ) : (
        <CanonicalOrganizationResolver onResolved={onCanonicalOrganizationResolved} renderState={renderState} />
      )}
    </ErrorBoundary>
  );
}

/** 使えなくなった保存hintを破棄し、通常の組織解決へ戻す。 */
function InaccessibleOrganizationHint({
  organizationId,
  onInaccessible,
  children,
}: {
  organizationId: string;
  onInaccessible: (organizationId: string) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    onInaccessible(organizationId);
  }, [onInaccessible, organizationId]);

  return children;
}

function CanonicalOrganizationResolver({
  onResolved,
  renderState,
}: {
  onResolved: (organizationId: Id<"organizations">) => void;
  renderState: (state: AppOrganizationState) => ReactNode;
}) {
  const organizations = usePaginatedQuery(
    api.appOrganization.queries.listMyOrganizationContexts,
    {},
    {
      initialNumItems: 1,
    },
  );
  const canonicalOrganizationId = organizations.results[0]?.organizationId;

  useEffect(() => {
    if (canonicalOrganizationId) onResolved(canonicalOrganizationId);
  }, [canonicalOrganizationId, onResolved]);

  useEffect(() => {
    if (organizations.results.length === 0 && organizations.status === "CanLoadMore") {
      organizations.loadMore(PAGE_SIZE);
    }
  }, [organizations.loadMore, organizations.results.length, organizations.status]);

  if (canonicalOrganizationId) return renderState({ kind: "loading" });
  if (organizations.status === "Exhausted") return renderState({ kind: "empty" });
  return renderState({ kind: "loading" });
}

function VerifiedOrganizationScope({
  organizationId,
  source,
  onVerified,
  onInaccessible,
  renderState,
  children,
}: {
  organizationId: string;
  /** hintは保存値から選んだ未検証の候補。検証後にURLへ反映されてurlへ変わる。 */
  source: "url" | "hint";
  onVerified: (organizationId: Id<"organizations">) => void;
  onInaccessible: (organizationId: string) => void;
  renderState: (state: AppOrganizationState) => ReactNode;
  children: ReactNode;
}) {
  const typedOrganizationId = organizationId as Id<"organizations">;
  const organization = useQuery(api.appOrganization.queries.getOrganizationContext, {
    organizationId: typedOrganizationId,
  });
  const organizations = usePaginatedQuery(
    api.appOrganization.queries.listMyOrganizationContexts,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  // 店舗一覧は組織IDだけで開始できるため、組織の検証完了を待たない。権限はserverが同じ組織所属で検証する。
  const shopsQuery = usePaginatedQuery(
    api.appOrganization.queries.listOrganizationShops,
    organization === null ? "skip" : { organizationId: typedOrganizationId },
    { initialNumItems: PAGE_SIZE },
  );

  useEffect(() => {
    if (shopsQuery.status === "CanLoadMore") shopsQuery.loadMore(PAGE_SIZE);
  }, [shopsQuery.loadMore, shopsQuery.status]);

  useEffect(() => {
    if (organizations.status === "CanLoadMore") organizations.loadMore(PAGE_SIZE);
  }, [organizations.loadMore, organizations.status]);

  // 計測にも、serverで検証した組織scopeを付ける。
  const verifiedOrganizationId = organization?.organizationId;
  const verifiedOrganizationPlan = organization?.organizationPlan;
  useEffect(() => {
    if (!verifiedOrganizationId || !verifiedOrganizationPlan) return;
    setManagerMeasurementOrganization({
      organizationId: verifiedOrganizationId,
      organizationPlan: verifiedOrganizationPlan,
    });
    return () => setManagerMeasurementOrganization(null);
  }, [verifiedOrganizationId, verifiedOrganizationPlan]);

  useEffect(() => {
    if (verifiedOrganizationId) onVerified(verifiedOrganizationId);
  }, [onVerified, verifiedOrganizationId]);

  const isInaccessible = organization === null;
  useEffect(() => {
    if (isInaccessible) onInaccessible(organizationId);
  }, [isInaccessible, onInaccessible, organizationId]);

  if (organization === undefined) return renderState({ kind: "loading" });
  if (organization === null) {
    // 保存hintが使えない場合はエラーにせず、hintの破棄後に通常の組織解決へ戻る。
    return source === "hint"
      ? renderState({ kind: "loading" })
      : renderState({ kind: "error", reason: "inaccessible" });
  }
  // 子routeはURLのorgを前提にするため、hintの検証後はURLへの反映を待つ。
  if (source === "hint") return renderState({ kind: "loading" });

  const shops =
    shopsQuery.status === "Exhausted"
      ? shopsQuery.results.map((shop) => ({ id: shop.shopId, name: shop.shopName }))
      : null;
  const organizationOptions =
    organizations.status === "Exhausted"
      ? organizations.results.map((candidate) => ({
          id: candidate.organizationId,
          name: candidate.organizationName,
        }))
      : null;

  return (
    <AppOrganizationScopeContext.Provider
      value={{
        organizationId: organization.organizationId,
        organizationName: organization.organizationName,
        organizationPlan: organization.organizationPlan,
        organizations: organizationOptions,
        shops,
      }}
    >
      {children}
    </AppOrganizationScopeContext.Provider>
  );
}

export function resolveAppOrganizationErrorReason(
  error: Error,
  hasExplicitOrganization: boolean,
): "inaccessible" | "query" {
  if (!hasExplicitOrganization) return "query";

  const message = error.message.toLowerCase();
  const data = error instanceof ConvexError ? String(error.data).toLowerCase() : "";
  const isAccessError =
    data.includes("not found") ||
    message.includes("not found") ||
    message.includes("argumentvalidationerror") ||
    message.includes("invalid id");

  return isAccessError ? "inaccessible" : "query";
}

export type { AppOrganizationState } from "./AppOrganizationStateView";
export { AppOrganizationStateView } from "./AppOrganizationStateView";

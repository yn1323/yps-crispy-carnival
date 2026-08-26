import { usePaginatedQuery, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AppFeatureRequestShop } from "@/src/components/features/FeatureRequestDialog/appScope";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import type { AppOrganizationState } from "./AppOrganizationStateView";

const PAGE_SIZE = 50;

export type AppOrganizationScope = {
  organizationId: Id<"organizations">;
  organizationName: string;
  /** nullの間は全cursorを走査中。Headerの組織切替へ部分的な一覧を公開しない。 */
  organizations: AppOrganizationOption[] | null;
  /** nullの間は全cursorを走査中。部分的な店舗一覧を選択肢として公開しない。 */
  activeShops: AppFeatureRequestShop[] | null;
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
  return (
    <ErrorBoundary
      key={requestedOrganizationId ?? "canonical-organization"}
      fallback={(error) =>
        renderState({
          kind: "error",
          reason: resolveAppOrganizationErrorReason(error, requestedOrganizationId !== undefined),
        })
      }
    >
      {requestedOrganizationId ? (
        <VerifiedOrganizationScope organizationId={requestedOrganizationId} renderState={renderState}>
          {children}
        </VerifiedOrganizationScope>
      ) : (
        <CanonicalOrganizationResolver onResolved={onCanonicalOrganizationResolved} renderState={renderState} />
      )}
    </ErrorBoundary>
  );
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
  renderState,
  children,
}: {
  organizationId: string;
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
  const shops = usePaginatedQuery(
    api.appOrganization.queries.listOrganizationActiveShops,
    organization ? { organizationId: organization.organizationId } : "skip",
    { initialNumItems: PAGE_SIZE },
  );

  useEffect(() => {
    if (shops.status === "CanLoadMore") shops.loadMore(PAGE_SIZE);
  }, [shops.loadMore, shops.status]);

  useEffect(() => {
    if (organizations.status === "CanLoadMore") organizations.loadMore(PAGE_SIZE);
  }, [organizations.loadMore, organizations.status]);

  if (organization === undefined) return renderState({ kind: "loading" });
  if (organization === null) return renderState({ kind: "error", reason: "inaccessible" });

  const activeShops =
    shops.status === "Exhausted" ? shops.results.map((shop) => ({ id: shop.shopId, name: shop.shopName })) : null;
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
        organizations: organizationOptions,
        activeShops,
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

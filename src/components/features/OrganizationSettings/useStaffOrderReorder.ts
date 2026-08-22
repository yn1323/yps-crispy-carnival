import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toaster } from "@/src/components/ui/toaster";
import { orderPeopleByPersonIds, reorderStaffOrderPersonIds } from "./staffOrder";
import type { OrganizationPersonView } from "./types";

export type StaffOrderReorderSource = {
  organizationId: Id<"organizations">;
  orderedPersonIds: readonly Id<"organizationPeople">[];
  orderFingerprint: string;
  canReorder: boolean;
  disabledReason?: string;
};

type LocalOrder = {
  personIds: Id<"organizationPeople">[];
  expectedOrderFingerprint: string;
};

export function useStaffOrderReorder(people: readonly OrganizationPersonView[], source?: StaffOrderReorderSource) {
  const saveOrder = useMutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder);
  const sourcePersonIds = useMemo(
    () =>
      source?.orderedPersonIds.map((personId) => personId) ??
      people.map((person) => person.id as Id<"organizationPeople">),
    [people, source?.orderedPersonIds],
  );
  const sourceKey = useMemo(
    () => `${source?.orderFingerprint ?? "disabled"}:${sourcePersonIds.join(",")}`,
    [source?.orderFingerprint, sourcePersonIds],
  );
  const initialOrder = useMemo<LocalOrder>(
    () => ({
      personIds: sourcePersonIds,
      expectedOrderFingerprint: source?.orderFingerprint ?? "",
    }),
    [source?.orderFingerprint, sourcePersonIds],
  );
  const [localOrder, setLocalOrder] = useState(initialOrder);
  const [isSaving, setIsSaving] = useState(false);
  const acceptedSourceKeyRef = useRef(sourceKey);
  const localOrderRef = useRef(localOrder);
  const sourceRef = useRef(source);
  const isSavingRef = useRef(false);
  const hasPendingSource = !isSaving && sourceKey !== acceptedSourceKeyRef.current;
  const effectiveOrder = hasPendingSource ? initialOrder : localOrder;
  localOrderRef.current = effectiveOrder;
  sourceRef.current = source;

  useEffect(() => {
    if (isSaving || sourceKey === acceptedSourceKeyRef.current) return;
    acceptedSourceKeyRef.current = sourceKey;
    localOrderRef.current = initialOrder;
    setLocalOrder(initialOrder);
  }, [initialOrder, isSaving, sourceKey]);

  const reorder = useCallback(
    async (activePersonId: string, overPersonId: string) => {
      const currentSource = sourceRef.current;
      if (!currentSource?.canReorder || isSavingRef.current) return;

      const previousOrder = localOrderRef.current;
      const nextPersonIds = reorderStaffOrderPersonIds(previousOrder.personIds, activePersonId, overPersonId);
      if (nextPersonIds.every((personId, index) => personId === previousOrder.personIds[index])) return;

      const optimisticOrder = { ...previousOrder, personIds: nextPersonIds };
      isSavingRef.current = true;
      localOrderRef.current = optimisticOrder;
      setLocalOrder(optimisticOrder);
      setIsSaving(true);

      try {
        const result = await saveOrder({
          organizationId: currentSource.organizationId,
          orderedPersonIds: nextPersonIds,
          expectedOrderFingerprint: previousOrder.expectedOrderFingerprint,
        });
        const savedOrder = {
          personIds: nextPersonIds,
          expectedOrderFingerprint: result.orderFingerprint,
        };
        localOrderRef.current = savedOrder;
        setLocalOrder(savedOrder);
      } catch {
        localOrderRef.current = previousOrder;
        setLocalOrder(previousOrder);
        toaster.create({
          title: "並び順を保存できませんでした",
          type: "error",
          duration: Number.POSITIVE_INFINITY,
        });
      } finally {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    },
    [saveOrder],
  );

  return {
    people: orderPeopleByPersonIds(people, effectiveOrder.personIds),
    staffOrder: source
      ? {
          disabled: !source.canReorder || isSaving,
          disabledReason: source.disabledReason,
          isSaving,
          onReorder: (activePersonId: string, overPersonId: string) => {
            void reorder(activePersonId, overPersonId);
          },
        }
      : undefined,
  };
}

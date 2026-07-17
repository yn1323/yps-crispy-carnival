import { useMutation } from "convex/react";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { selectedShopAtom } from "@/src/stores/shop";
import type { OrganizationPersonView } from "../types";
import type { PersonRemovalDialogState } from "./types";

type Operation = PersonRemovalDialogState["kind"];

export function usePersonRemovalController(people: OrganizationPersonView[]) {
  const selectedShop = useAtomValue(selectedShopAtom);
  const removeManagerRole = useMutation(api.organization.mutations.removeManagerRole);
  const removePerson = useMutation(api.organization.mutations.removePersonFromOrganization);
  const [dialog, setDialog] = useState<PersonRemovalDialogState | null>(null);
  const latestPeopleRef = useRef(people);
  latestPeopleRef.current = people;

  useEffect(() => {
    if (!dialog) return;
    const latestPerson = people.find((person) => person.id === dialog.person.id);
    if (!latestPerson || !canRun(latestPerson, dialog.kind)) {
      setDialog(null);
      return;
    }
    if (latestPerson !== dialog.person) setDialog({ ...dialog, person: latestPerson });
  }, [dialog, people]);

  const { run, isRunning } = useSingleFlight(async (operation: Operation, personId: string) => {
    const person = latestPeopleRef.current.find((candidate) => candidate.id === personId);
    if (!person || !canRun(person, operation) || !selectedShop?.shopId) {
      setDialog(null);
      return;
    }

    const requestId = crypto.randomUUID();
    const shopId = selectedShop.shopId as Id<"shops">;
    try {
      switch (operation) {
        case "removeManagerRole":
          await removeManagerRole({
            shopId,
            personId: person.id as Id<"organizationPeople">,
            requestId,
          });
          showSuccessToast({
            title: "管理者権限を外しました",
            description: person.isStaff
              ? "スタッフとしての店舗所属と業務用アクセスは維持しています。"
              : "スタッフ所属がないため、このグループへのアクセスも終了しました。",
          });
          break;
        case "removePerson":
          await removePerson({
            shopId,
            personId: person.id as Id<"organizationPeople">,
            requestId,
          });
          showSuccessToast({
            title: "利用者をグループから削除しました",
            description: "過去のシフト履歴は保持されます。",
          });
          break;
      }
      setDialog(null);
    } catch (error) {
      showErrorToast(error);
      throw error;
    }
  });

  const open = (kind: Operation, personId: string) => {
    const person = latestPeopleRef.current.find((candidate) => candidate.id === personId);
    if (person && canRun(person, kind)) setDialog({ kind, person });
  };

  return {
    removeManagerRole: (personId: string) => open("removeManagerRole", personId),
    removePerson: (personId: string) => open("removePerson", personId),
    dialog: {
      dialog,
      isRunning,
      onClose: () => setDialog(null),
      onSubmit: () => {
        if (dialog) void run(dialog.kind, dialog.person.id).catch(() => undefined);
      },
    },
  };
}

function canRun(person: OrganizationPersonView, operation: Operation): boolean {
  switch (operation) {
    case "removeManagerRole":
      return person.canRemoveManagerRole;
    case "removePerson":
      return person.canRemove;
  }
}

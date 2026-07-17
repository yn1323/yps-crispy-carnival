import type { OrganizationPersonView } from "../types";

export type PersonRemovalDialogState =
  | { kind: "removeManagerRole"; person: OrganizationPersonView }
  | { kind: "removePerson"; person: OrganizationPersonView };

import type { OrganizationPersonView } from "../types";

export type PersonRemovalDialogState =
  | { kind: "removePersonFromShop"; person: OrganizationPersonView }
  | { kind: "removeManagerRole"; person: OrganizationPersonView }
  | { kind: "removePerson"; person: OrganizationPersonView };

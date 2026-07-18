import type { GenericId } from "convex/values";

export const DELETED_SHOP_NAME = "削除済み店舗";
export const DELETED_ORGANIZATION_NAME = "削除済みグループ";
export const DELETED_PERSON_NAME = "削除済みユーザー";

type TombstoneTable = "organizations" | "organizationPeople" | "staffs" | "users";

export function deletedEmail(table: TombstoneTable, id: GenericId<string>) {
  return `deleted+${table}.${id}@example.invalid`;
}

export function deletedLineUserId(id: GenericId<string>) {
  return `deleted:${id}`;
}

export function organizationTombstone(id: GenericId<string>) {
  const email = deletedEmail("organizations", id);
  return {
    name: DELETED_ORGANIZATION_NAME,
    billingEmail: email,
    billingEmailNormalized: email,
  };
}

export function personTombstone(id: GenericId<string>) {
  const email = deletedEmail("organizationPeople", id);
  return { name: DELETED_PERSON_NAME, email, emailNormalized: email };
}

export function staffTombstone(id: GenericId<string>) {
  const email = deletedEmail("staffs", id);
  return { name: DELETED_PERSON_NAME, email, emailNormalized: email };
}

export function userTombstone(id: GenericId<string>) {
  const email = deletedEmail("users", id);
  return { name: DELETED_PERSON_NAME, email, emailNormalized: email };
}

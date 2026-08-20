import type { Id } from "@/convex/_generated/dataModel";

export type StaffOrderPerson = {
  personId: Id<"organizationPeople">;
  name: string;
  email: string | null;
  shopNames: readonly string[];
};

export type StaffOrderAvailability = "ready" | "tooManyPeople" | "tooManyActiveShops" | "legacyDataIncomplete";

export type StaffOrderEditorSnapshot = {
  people: StaffOrderPerson[];
  orderFingerprint: string;
  canWrite: boolean;
  writeDisabledReason?: string;
  availability: StaffOrderAvailability;
};

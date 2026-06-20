import type { z } from "zod";
import { addStaffsSchema, staffEntrySchema } from "@/convex/staff/schemas";

export { staffEntrySchema };
export type StaffEntry = z.infer<typeof staffEntrySchema>;

export const addStaffSchema = addStaffsSchema;

export type AddStaffFormData = z.infer<typeof addStaffSchema>;

import type { z } from "zod";
import { editStaffSchema } from "@/convex/staff/schemas";

export { editStaffSchema };

export type EditStaffFormData = z.infer<typeof editStaffSchema>;

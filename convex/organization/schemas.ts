import { requiredDisplayTextSchema } from "../_lib/validation";
import { ORGANIZATION_NAME_MAX_LENGTH } from "../constants";

export const organizationNameSchema = requiredDisplayTextSchema({
  label: "事業者名",
  maxLength: ORGANIZATION_NAME_MAX_LENGTH,
});

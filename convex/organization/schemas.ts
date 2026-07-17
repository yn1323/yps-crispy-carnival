import { requiredDisplayTextSchema } from "../_lib/validation";
import { ORGANIZATION_NAME_MAX_LENGTH } from "../constants";

export const organizationNameSchema = requiredDisplayTextSchema({
  label: "グループ名",
  maxLength: ORGANIZATION_NAME_MAX_LENGTH,
});

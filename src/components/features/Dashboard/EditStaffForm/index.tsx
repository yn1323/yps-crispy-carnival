import { PersonProfileForm, type PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import type { Staff } from "../types";

export type EditStaffFormData = PersonProfileFormData;

type Props = {
  staff: Staff;
  onSubmit: (data: EditStaffFormData) => void | Promise<void>;
};

export const EditStaffForm = ({ staff, onSubmit }: Props) => {
  return (
    <PersonProfileForm
      formId="edit-staff-form"
      initialValues={{ name: staff.name, email: staff.email }}
      onSubmit={onSubmit}
    />
  );
};

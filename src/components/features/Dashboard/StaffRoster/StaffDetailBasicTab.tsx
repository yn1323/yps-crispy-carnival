import { Flex, Stack } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import { EditStaffForm, type EditStaffFormData } from "../EditStaffForm";
import type { Staff } from "../types";

type Props = {
  staff: Staff;
  onEdit: (data: EditStaffFormData) => void | Promise<void>;
  isEditing: boolean;
};

export const StaffDetailBasicTab = ({ staff, onEdit, isEditing }: Props) => (
  <Stack gap={5}>
    <EditStaffForm key={staff._id} staff={staff} onSubmit={onEdit} />
    <Flex justify="flex-end">
      <Button type="submit" form="edit-staff-form" colorPalette="teal" loading={isEditing}>
        変更を保存
      </Button>
    </Flex>
  </Stack>
);

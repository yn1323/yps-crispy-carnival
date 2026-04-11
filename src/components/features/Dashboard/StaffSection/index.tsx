import { Box, Button, Flex, Heading, Stack } from "@chakra-ui/react";
import { LuUserPlus, LuUsers } from "react-icons/lu";
import { Empty } from "@/src/components/ui/Empty";
import { StaffListItem } from "../StaffListItem";
import type { Staff } from "../types";

type Props = {
  staffs: Staff[];
  onAddClick: () => void;
  onEdit: (staff: Staff) => void;
  onDelete: (staff: Staff) => void;
};

export const StaffSection = ({ staffs, onAddClick, onEdit, onDelete }: Props) => {
  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center">
        <Heading size={{ base: "md", lg: "lg" }}>スタッフ</Heading>
        <Button size="sm" colorPalette="teal" onClick={onAddClick}>
          <LuUserPlus />
          スタッフを追加
        </Button>
      </Flex>
      {staffs.length === 0 ? (
        <Box border="1px solid" borderColor="gray.200" borderRadius="lg">
          <Empty
            icon={LuUsers}
            title="スタッフが登録されていません"
            description="スタッフを追加して、シフト管理を始めましょう"
            minH="160px"
          />
        </Box>
      ) : (
        <Box border="1px solid" borderColor="gray.200" borderRadius="lg" overflow="hidden">
          {staffs.map((staff) => (
            <StaffListItem key={staff._id} staff={staff} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </Box>
      )}
    </Stack>
  );
};

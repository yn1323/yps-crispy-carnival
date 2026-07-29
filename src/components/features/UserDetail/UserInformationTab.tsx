import { Box, Flex, Heading, Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { PersonProfileForm } from "@/src/components/shared/PersonProfileForm";
import { Button } from "@/src/components/ui/Button";
import type { UserDetailData } from "./types";

type Props = {
  data: UserDetailData;
  isReadOnly: boolean;
  isUpdating: boolean;
  managerSettings: ReactNode;
  onUpdate: (data: PersonProfileFormData) => void | Promise<void>;
};

export function UserInformationTab({ data, isReadOnly, isUpdating, managerSettings, onUpdate }: Props) {
  const formId = `user-profile-${data.person.id}`;

  return (
    <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
      <Box pb={6}>
        <Stack gap={5}>
          <Heading as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
            ユーザー情報
          </Heading>
          <fieldset disabled={isReadOnly} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
            <Stack gap={5}>
              <PersonProfileForm
                // 別管理者による更新が届いた場合は最新値を優先し、古い入力で上書きしない。
                key={`${data.person.id}:${data.person.name}:${data.person.email}`}
                formId={formId}
                initialValues={{ name: data.person.name, email: data.person.email }}
                onSubmit={async (formData) => {
                  await onUpdate(formData);
                }}
              />
              <Flex justify="flex-end">
                <Button type="submit" form={formId} colorPalette="teal" loading={isUpdating}>
                  変更を保存
                </Button>
              </Flex>
            </Stack>
          </fieldset>
        </Stack>
      </Box>
      {managerSettings && <Box pt={6}>{managerSettings}</Box>}
    </Stack>
  );
}

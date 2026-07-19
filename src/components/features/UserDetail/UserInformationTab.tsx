import { Badge, Box, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { LuStore } from "react-icons/lu";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { PersonProfileForm } from "@/src/components/shared/PersonProfileForm";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import type { UserDetailData } from "./types";

type Props = {
  data: UserDetailData;
  isReadOnly: boolean;
  isUpdating: boolean;
  onUpdate: (data: PersonProfileFormData) => void | Promise<void>;
};

export function UserInformationTab({ data, isReadOnly, isUpdating, onUpdate }: Props) {
  const formId = `user-profile-${data.person.id}`;

  return (
    <Stack gap={8}>
      <Stack gap={4}>
        <Stack gap={1}>
          <Text as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
            ユーザー情報
          </Text>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            名前とメールアドレスの変更は、グループ内のすべての店舗に反映されます。
          </Text>
        </Stack>
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

      <Stack gap={4}>
        <Stack gap={1}>
          <Text as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
            所属店舗
          </Text>
          <Text fontSize="sm" color="fg.muted">
            店舗ごとのシフト対象とLINE連携状態を確認できます。
          </Text>
        </Stack>
        {data.memberships.length === 0 ? (
          <Empty
            icon={LuStore}
            title="所属店舗はありません"
            description="このユーザーは、現在どの店舗にもスタッフとして所属していません。"
            variant="section"
            py={8}
          />
        ) : (
          <Stack gap={2}>
            {data.memberships.map((membership) => {
              const isLineActive = membership.line.isLinked && membership.line.isFollowing;
              return (
                <Box key={membership.staffId} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="lg" p={4}>
                  <Flex align={{ base: "flex-start", sm: "center" }} justify="space-between" gap={3}>
                    <Text fontWeight="semibold" color="gray.900">
                      {membership.shopName}
                    </Text>
                    <HStack gap={2} wrap="wrap" justify="flex-end">
                      {membership.shopStatus !== "active" && (
                        <Badge colorPalette={membership.shopStatus === "archived" ? "gray" : "orange"} variant="subtle">
                          {membership.shopStatus === "archived" ? "アーカイブ済み" : "プラン停止中"}
                        </Badge>
                      )}
                      <Badge colorPalette={membership.excludedFromShift ? "gray" : "green"} variant="subtle">
                        {membership.excludedFromShift ? "シフト対象外" : "シフト対象"}
                      </Badge>
                      <Badge colorPalette={isLineActive ? "green" : "gray"} variant="subtle">
                        {isLineActive ? "LINE連携済み" : "LINE未連携"}
                      </Badge>
                    </HStack>
                  </Flex>
                </Box>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

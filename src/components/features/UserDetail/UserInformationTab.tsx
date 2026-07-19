import { Badge, Box, Flex, HStack, Link, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import type { ReactNode } from "react";
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
  managerSettings: ReactNode;
  onUpdate: (data: PersonProfileFormData) => void | Promise<void>;
};

export function UserInformationTab({ data, isReadOnly, isUpdating, managerSettings, onUpdate }: Props) {
  const formId = `user-profile-${data.person.id}`;

  return (
    <Stack gap={8}>
      <Stack gap={3}>
        <Text
          as="h2"
          fontSize={{ base: "lg", lg: "xl" }}
          lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
          fontWeight="bold"
          color="gray.900"
        >
          ユーザー情報
        </Text>
        <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
          <Stack gap={6}>
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
            <Box borderTopWidth="1px" borderColor="blackAlpha.100" pt={6}>
              {managerSettings}
            </Box>
          </Stack>
        </Box>
      </Stack>

      <Stack gap={3}>
        <Text
          as="h2"
          fontSize={{ base: "lg", lg: "xl" }}
          lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
          fontWeight="bold"
          color="gray.900"
        >
          所属店舗
        </Text>
        <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
          {data.shops.length === 0 ? (
            <Empty
              icon={LuStore}
              title="グループに店舗はありません"
              description="店舗が追加されると、ここに所属状況が表示されます。"
              variant="section"
              py={8}
            />
          ) : (
            <Stack gap={2}>
              {data.shops.map((shop) => {
                const membership = data.memberships.find((candidate) => candidate.shopId === shop.shopId) ?? null;
                const isLineActive = Boolean(membership?.line.isLinked && membership.line.isFollowing);
                return (
                  <Link
                    key={shop.shopId}
                    asChild
                    display="block"
                    borderWidth="1px"
                    borderColor="blackAlpha.100"
                    borderRadius="lg"
                    p={4}
                    color="inherit"
                    textDecoration="none"
                    transition="background-color 0.15s ease, border-color 0.15s ease"
                    _hover={{ bg: "gray.100", borderColor: "gray.300", textDecoration: "none" }}
                    _focusVisible={{ outline: "2px solid", outlineColor: "teal.500", outlineOffset: "2px" }}
                  >
                    <RouterLink to="/dashboard" search={{ shop: shop.shopId }}>
                      <Flex
                        direction={{ base: "column", sm: "row" }}
                        align={{ base: "flex-start", sm: "center" }}
                        justify="space-between"
                        gap={3}
                      >
                        <Text order={{ base: 2, sm: 1 }} fontWeight="semibold" color="gray.900">
                          {shop.shopName}
                        </Text>
                        <HStack
                          order={{ base: 1, sm: 2 }}
                          gap={2}
                          wrap="wrap"
                          justify={{ base: "flex-start", sm: "flex-end" }}
                        >
                          {shop.shopStatus !== "active" && (
                            <Badge colorPalette={shop.shopStatus === "archived" ? "gray" : "orange"} variant="subtle">
                              {shop.shopStatus === "archived" ? "アーカイブ済み" : "プラン停止中"}
                            </Badge>
                          )}
                          {!membership ? (
                            <Badge colorPalette="gray" variant="subtle">
                              未所属
                            </Badge>
                          ) : (
                            <>
                              {membership.excludedFromShift && (
                                <Badge colorPalette="gray" variant="subtle">
                                  シフト対象外
                                </Badge>
                              )}
                              <Badge colorPalette={isLineActive ? "green" : "gray"} variant="subtle">
                                {isLineActive ? "LINE連携済み" : "LINE未連携"}
                              </Badge>
                            </>
                          )}
                        </HStack>
                      </Flex>
                    </RouterLink>
                  </Link>
                );
              })}
            </Stack>
          )}
        </Box>
      </Stack>
    </Stack>
  );
}

import { Button, Card, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { toaster } from "@/src/components/ui/toaster";
import { type SchemaType, schema } from "./schema";

type Props = {
  user: Doc<"users">;
  shopId: string;
  callbackRoutingPath?: string;
};

export const UserEdit = ({ user, shopId, callbackRoutingPath }: Props) => {
  const navigate = useNavigate();
  const updateUser = useMutation(api.user.updateUser);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SchemaType>({
    resolver: zodResolver(schema),
    defaultValues: {
      userName: user.name,
    },
  });

  const onSubmit: SubmitHandler<SchemaType> = async (data) => {
    try {
      await updateUser({
        id: user._id,
        name: data.userName,
      });

      toaster.create({
        description: "ユーザー情報を更新しました",
        type: "success",
      });
      navigate({ to: callbackRoutingPath ?? `/shops/${shopId}/members/${user._id}` });
    } catch (error) {
      console.error("ユーザー更新エラー:", error);
      toaster.create({
        description: "ユーザー情報の更新に失敗しました",
        type: "error",
      });
    }
  };

  return (
    <Card.Root w="full" maxW="2xl" mx="auto">
      <Card.Body>
        <Stack gap="8" w="full">
          <Text fontSize="lg" fontWeight="semibold">
            ユーザー編集
          </Text>
          <Stack
            gap="6"
            as="form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(onSubmit)(e);
            }}
          >
            <Field.Root invalid={!!errors.userName}>
              <Field.Label>ユーザー名</Field.Label>
              <Input {...register("userName")} placeholder="ユーザー名" />
              <Field.ErrorText>{errors.userName?.message}</Field.ErrorText>
            </Field.Root>

            <Flex gap="3" w="full">
              <Button
                variant="outline"
                colorPalette="gray"
                onClick={() => navigate({ to: callbackRoutingPath ?? `/shops/${shopId}/members/${user._id}` })}
                w={{ base: "full", md: "auto" }}
              >
                キャンセル
              </Button>
              <Button
                variant="solid"
                colorPalette="teal"
                type="submit"
                loading={isSubmitting}
                w={{ base: "full", md: "auto" }}
              >
                更新
              </Button>
            </Flex>
          </Stack>
        </Stack>
      </Card.Body>
    </Card.Root>
  );
};

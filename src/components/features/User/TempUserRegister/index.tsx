import { Button, Card, Field, HStack, Input, Stack, Text } from "@chakra-ui/react";
import { useAuth } from "@clerk/clerk-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toaster } from "@/src/components/ui/toaster";
import { type SchemaType, schema } from "./schema";

type Props = {
  shopId: string;
  callbackRoutingPath?: string;
};

export const TempUserRegister = ({ shopId, callbackRoutingPath }: Props) => {
  const { userId } = useAuth();
  // @ts-expect-error - tempUser APIは新規追加のため型定義が生成されていない
  const createTempUser = useMutation(api.tempUser.createTempUserWithInvite);
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SchemaType>({
    resolver: zodResolver(schema),
    defaultValues: {
      role: "staff",
    },
  });

  const onSubmit: SubmitHandler<SchemaType> = async (data) => {
    const result = await createTempUser({
      shopId: shopId as Id<"shops">,
      userName: data.userName,
      email: data.email,
      role: data.role,
      authId: userId ?? "",
    }).catch(() => {
      toaster.create({
        description: "仮登録ユーザーの作成に失敗しました",
        type: "error",
      });
    });

    if (result?.success) {
      toaster.create({
        description: "招待メールを送信しました",
        type: "success",
      });
      if (callbackRoutingPath) {
        navigate({ to: callbackRoutingPath });
      }
    }
  };

  return (
    <Card.Root w="full" maxW="2xl" mx="auto">
      <Card.Body>
        <Stack gap="8" w="full">
          <Text fontSize="lg" fontWeight="semibold">
            スタッフ仮登録
          </Text>
          <Text fontSize="sm" color="fg.muted">
            スタッフ情報を登録し、招待メールを送信します。
            登録後、スタッフはメール内の招待URLからアカウントを作成できます。
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
              <Field.Label>スタッフ名</Field.Label>
              <Input {...register("userName")} placeholder="山田太郎" />
              <Field.ErrorText>{errors.userName?.message}</Field.ErrorText>
            </Field.Root>

            <Field.Root invalid={!!errors.email}>
              <Field.Label>メールアドレス</Field.Label>
              <Input {...register("email")} type="email" placeholder="staff@example.com" />
              <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
              <Field.HelperText>招待URLを送信するメールアドレスです（保存されません）</Field.HelperText>
            </Field.Root>

            <Field.Root invalid={!!errors.role}>
              <Field.Label>役割</Field.Label>
              <Stack gap="2">
                <label>
                  <HStack>
                    <input type="radio" value="staff" {...register("role")} />
                    <Text>スタッフ</Text>
                  </HStack>
                </label>
                <label>
                  <HStack>
                    <input type="radio" value="manager" {...register("role")} />
                    <Text>マネージャー</Text>
                  </HStack>
                </label>
              </Stack>
              <Field.ErrorText>{errors.role?.message}</Field.ErrorText>
            </Field.Root>

            <HStack gap="3" justifyContent="flex-end">
              <Button
                variant="outline"
                onClick={() => callbackRoutingPath && navigate({ to: callbackRoutingPath })}
                w={{ base: "full", lg: "auto" }}
              >
                キャンセル
              </Button>
              <Button
                variant="solid"
                colorPalette="teal"
                type="submit"
                loading={isSubmitting}
                w={{ base: "full", lg: "auto" }}
              >
                招待メールを送信
              </Button>
            </HStack>
          </Stack>
        </Stack>
      </Card.Body>
    </Card.Root>
  );
};

import { Button, Card, Field, HStack, Input, Stack, Text } from "@chakra-ui/react";
import { useAuth } from "@clerk/clerk-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useSetAtom } from "jotai";
import { type SubmitHandler, useForm } from "react-hook-form";
import { api } from "@/convex/_generated/api";
import { toaster } from "@/src/components/ui/toaster";
import { userAtom } from "@/src/stores/user";
import { type SchemaType, schema } from "./schema";

type Props = {
  callbackRoutingPath?: string;
};

export const UserRegister = ({ callbackRoutingPath }: Props) => {
  const setUser = useSetAtom(userAtom);
  const { userId } = useAuth();
  const createUser = useMutation(api.user.createUser);
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SchemaType>({
    resolver: zodResolver(schema),
  });

  const onSubmit: SubmitHandler<SchemaType> = async (data) => {
    const result = await createUser({
      authId: userId ?? "",
      name: data.userName,
    }).catch(() => {
      toaster.create({
        description: "ユーザー名登録に失敗しました",
        type: "error",
      });
    });

    if (result?.success) {
      setUser({ authId: userId ?? "", name: data.userName });
      toaster.create({
        description: "ユーザー名登録が完了しました",
        type: "success",
      });
      callbackRoutingPath && navigate({ to: callbackRoutingPath });
    }
  };

  return (
    <Card.Root w="full" maxW="2xl" mx="auto">
      <Card.Body>
        <Stack gap="8" w="full">
          <Text fontSize="lg" fontWeight="semibold">
            ユーザー登録
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

            <HStack gap="3" justifyContent="flex-end">
              <Button
                variant="solid"
                colorPalette="teal"
                type="submit"
                loading={isSubmitting}
                w={{ base: "full", lg: "auto" }}
              >
                登録
              </Button>
            </HStack>
          </Stack>
        </Stack>
      </Card.Body>
    </Card.Root>
  );
};

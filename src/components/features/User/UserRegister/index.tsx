import { Box, Button, Field, Flex, HStack, Icon, Input, Link, Stack, Text } from "@chakra-ui/react";
import { useAuth } from "@clerk/clerk-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useSetAtom } from "jotai";
import { type SubmitHandler, useForm } from "react-hook-form";
import { IoArrowForward } from "react-icons/io5";
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
  const createUser = useMutation(api.user.mutations.create);
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SchemaType>({
    resolver: zodResolver(schema),
  });

  const onSubmit: SubmitHandler<SchemaType> = async (data) => {
    try {
      const result = await createUser({
        authId: userId ?? "",
        name: data.userName,
        email: data.email,
      });

      if (result?.success) {
        setUser({ authId: userId ?? "", name: data.userName, email: data.email });
        toaster.create({
          description: "ユーザー登録が完了しました",
          type: "success",
        });
        callbackRoutingPath && navigate({ to: callbackRoutingPath });
      }
    } catch {
      toaster.create({
        description: "ユーザー登録に失敗しました",
        type: "error",
      });
    }
  };

  return (
    <Box>
      <Box bg="white" borderRadius="2xl" boxShadow="2xl" p="8">
        {/* Progress indicator */}
        <Box mb="8">
          <Flex align="center" justify="space-between" mb="2">
            <Text fontSize="sm" color="gray.600">
              ステップ 1/1
            </Text>
            <Text fontSize="sm" color="teal.600">
              ほぼ完了
            </Text>
          </Flex>
          <Box w="full" h="2" bg="gray.100" borderRadius="full" overflow="hidden">
            <Box
              h="full"
              w="full"
              bgGradient="to-r"
              gradientFrom="teal.500"
              gradientTo="teal.600"
              borderRadius="full"
            />
          </Box>
        </Box>

        {/* Form */}
        <Stack
          gap="6"
          as="form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(onSubmit)(e);
          }}
        >
          <Field.Root invalid={!!errors.userName} required>
            <Field.Label>ユーザー名</Field.Label>
            <Input {...register("userName")} placeholder="山田 太郎" h="12" autoFocus />
            <Field.ErrorText>{errors.userName?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.email} required>
            <Field.Label>メールアドレス</Field.Label>
            <Input {...register("email")} type="email" placeholder="example@example.com" h="12" />
            <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
          </Field.Root>

          <Button type="submit" loading={isSubmitting} w="full" h="12" colorPalette="teal">
            <HStack gap="2">
              <Text>はじめる</Text>
              <Icon as={IoArrowForward} boxSize="4" />
            </HStack>
          </Button>
        </Stack>
      </Box>

      <Text textAlign="center" fontSize="xs" color="gray.500" mt="4">
        登録することで、
        <Link href="#" color="teal.600" _hover={{ textDecoration: "underline" }}>
          利用規約
        </Link>
        と
        <Link href="#" color="teal.600" _hover={{ textDecoration: "underline" }}>
          プライバシーポリシー
        </Link>
        に同意したものとみなされます
      </Text>
    </Box>
  );
};

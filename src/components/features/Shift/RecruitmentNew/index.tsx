import { Box, Container, Flex, Heading, Icon } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { LuCalendarPlus } from "react-icons/lu";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import { RecruitmentForm } from "../RecruitmentForm";
import { type RecruitmentFormSchemaType, recruitmentFormSchema } from "../RecruitmentForm/schema";

type RecruitmentNewProps = {
  shopId: string;
};

export const RecruitmentNew = ({ shopId }: RecruitmentNewProps) => {
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecruitmentFormSchemaType>({
    resolver: zodResolver(recruitmentFormSchema),
  });

  const onSubmit = handleSubmit(async (data) => {
    // TODO: useMutation呼び出し
    console.log("募集作成:", { shopId, ...data });

    toaster.create({
      description: "シフト募集を作成しました",
      type: "success",
    });

    navigate({ to: "/shops/$shopId/shifts", params: { shopId } });
  });

  return (
    <Container maxW="6xl">
      <Title prev={{ url: `/shops/${shopId}/shifts`, label: "シフト管理に戻る" }}>
        <Flex align="center" gap={3}>
          <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
            <Icon as={LuCalendarPlus} boxSize={6} color="teal.600" />
          </Flex>
          <Box>
            <Heading as="h2" size="xl" color="gray.900">
              新規シフト募集
            </Heading>
          </Box>
        </Flex>
      </Title>

      <RecruitmentForm register={register} errors={errors} isSubmitting={isSubmitting} onSubmit={onSubmit} />
    </Container>
  );
};

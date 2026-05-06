import { Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { LuCalendarX } from "react-icons/lu";
import { StaffHeaderBrand } from "@/src/components/templates/StaffHeader";
import { SubmitPageLayout } from "../SubmitPageLayout";

type Props = {
  shopName: string;
};

export const ExpiredSubmitView = ({ shopName }: Props) => {
  return (
    <SubmitPageLayout>
      <Box bg="teal.600" w="full">
        <Flex maxW="1024px" mx="auto" h={{ base: "56px", lg: "56px" }} px={4} align="center">
          <StaffHeaderBrand shopName={shopName} />
        </Flex>
      </Box>

      {/* Content */}
      <Flex flex={1} align="center" justify="center" bg="white">
        <VStack gap={4}>
          <Icon color="fg.subtle" boxSize={12}>
            <LuCalendarX />
          </Icon>
          <Text fontSize="lg" fontWeight="semibold">
            提出締切を過ぎています
          </Text>
          <Text fontSize="sm" color="fg.muted" textAlign="center">
            シフトの希望がある場合は、{"\n"}お店に直接ご連絡ください。
          </Text>
        </VStack>
      </Flex>
    </SubmitPageLayout>
  );
};

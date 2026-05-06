import { Button, Icon, Text, VStack } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { LuTriangleAlert } from "react-icons/lu";
import { StaffCenteredContent } from "@/src/components/templates/StaffLayout";

type Props = {
  recruitmentId: string | null;
};

export const ExpiredView = ({ recruitmentId }: Props) => {
  return (
    <StaffCenteredContent>
      <VStack gap={4}>
        <Icon as={LuTriangleAlert} boxSize={12} color="orange.500" />
        <Text fontSize="lg" fontWeight="semibold" textAlign="center">
          このリンクの有効期限が{"\n"}切れています
        </Text>
        <Text fontSize="sm" color="fg.muted" textAlign="center">
          下のボタンから新しいリンクを{"\n"}発行してください
        </Text>
        {recruitmentId && (
          <Link to="/shifts/reissue" search={{ recruitmentId }}>
            <Button colorPalette="teal" size="md" borderRadius="lg" px={6}>
              リンクを再発行する
            </Button>
          </Link>
        )}
      </VStack>
    </StaffCenteredContent>
  );
};

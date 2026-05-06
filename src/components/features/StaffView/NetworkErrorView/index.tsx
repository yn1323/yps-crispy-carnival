import { Icon, Text, VStack } from "@chakra-ui/react";
import { LuWifiOff } from "react-icons/lu";
import { StaffCenteredContent } from "@/src/components/templates/StaffLayout";
import { Button } from "@/src/components/ui/Button";

type Props = {
  onRetry: () => void;
};

export const NetworkErrorView = ({ onRetry }: Props) => {
  return (
    <StaffCenteredContent>
      <VStack gap={4}>
        <Icon as={LuWifiOff} boxSize={12} color="orange.500" />
        <Text fontSize="lg" fontWeight="semibold" textAlign="center">
          うまく開けませんでした
        </Text>
        <Text fontSize="sm" color="fg.muted" textAlign="center">
          通信がうまくつながりませんでした。{"\n"}
          再試行するか、ブラウザ（Safari/Chrome）{"\n"}で開き直してください。
        </Text>
        <Button colorPalette="teal" size="md" borderRadius="lg" px={6} onClick={onRetry}>
          再試行する
        </Button>
      </VStack>
    </StaffCenteredContent>
  );
};

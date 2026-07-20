import { HStack, Text } from "@chakra-ui/react";
import { LuChevronLeft } from "react-icons/lu";
import { IconButton } from "@/src/components/ui/Button";

type Props = {
  title: string;
  onBack: () => void;
  backLabel?: string;
};

export function DetailPageHeader({ title, onBack, backLabel = "前の画面に戻る" }: Props) {
  return (
    <HStack gap={2} minW={0}>
      <IconButton aria-label={backLabel} variant="ghost" size="sm" onClick={onBack}>
        <LuChevronLeft aria-hidden />
      </IconButton>
      <Text as="h1" textStyle={{ base: "sectionTitle", md: "pageTitle" }} color="gray.900">
        {title}
      </Text>
    </HStack>
  );
}

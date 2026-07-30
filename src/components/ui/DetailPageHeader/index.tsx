import { Heading, HStack, Text, VisuallyHidden } from "@chakra-ui/react";
import { useId } from "react";
import { LuChevronLeft } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

type Props = {
  title: string;
  onBack: () => void;
  backLabel?: string;
};

export function DetailPageHeader({ title, onBack, backLabel = "前の画面に戻る" }: Props) {
  const descriptionId = useId();

  return (
    <HStack gap={0} minW={0}>
      <Heading as="h1" minW={0}>
        <Button
          type="button"
          variant="plain"
          minH="44px"
          h="auto"
          px={0}
          gap={2}
          color="gray.900"
          textStyle={{ base: "sectionTitle", md: "pageTitle" }}
          justifyContent="flex-start"
          aria-describedby={descriptionId}
          onClick={onBack}
        >
          <LuChevronLeft aria-hidden />
          <Text as="span" truncate minW={0}>
            {title}
          </Text>
        </Button>
      </Heading>
      <VisuallyHidden id={descriptionId}>{backLabel}</VisuallyHidden>
    </HStack>
  );
}

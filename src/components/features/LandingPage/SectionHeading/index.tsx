import { Box, Heading, type HeadingProps } from "@chakra-ui/react";

type SectionHeadingProps = {
  /** 文節単位の配列。各文節の途中では折り返さない */
  phrases: string[];
} & Pick<HeadingProps, "textAlign">;

export const SectionHeading = ({ phrases, textAlign }: SectionHeadingProps) => (
  <Heading as="h2" fontSize={{ base: "2xl", md: "3xl" }} lineHeight="1.5" letterSpacing="0" textAlign={textAlign}>
    {phrases.map((phrase) => (
      <Box key={phrase} as="span" display="inline-block">
        {phrase}
      </Box>
    ))}
  </Heading>
);

import { Box, Container, chakra, VisuallyHidden, VStack } from "@chakra-ui/react";
import { useId, useRef } from "react";
import { SectionHeading } from "../SectionHeading";
import desktopVideoUrl from "./shiftori-intro.mp4?url";
import posterImage from "./shiftori-intro-poster.webp";
import mobileVideoUrl from "./shiftori-intro-sp.mp4?url";
import { useAutoplayInView } from "./useAutoplayInView";

// 動画の元データは apps/video で作る。スマホには720pの軽い版を出す
const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

// 音声も字幕の読み上げもないため、動画の内容を文章でも伝える
const VIDEO_DESCRIPTION =
  "シフトリの紹介動画です。音声はありません。店長が希望を集める、催促する、確定シフトを送るといった連絡を、毎月手作業で続けている場面から始まります。シフトリでシフトを募集すると、スタッフのスマホに提出のお願いが届き、スタッフは専用アプリなしでスマホから希望シフトを提出します。未提出の人には自動でお知らせが届きます。店長は集まった希望を見ながらシフトリの画面でシフトを組み、確定するとスタッフに確定シフトが届きます。希望シフトの集め方は、時間指定、日付選択、パターン選択からお店に合わせて選べます。最後に、2か月無料でお試しできることを案内します。";

export const IntroVideoSection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const descriptionId = useId();
  useAutoplayInView(videoRef);

  return (
    <Box as="section" bg="white" pt={{ base: 2, md: 4 }} pb={14}>
      <Container maxW="5xl">
        <VStack gap={{ base: 6, md: 8 }}>
          <SectionHeading phrases={["1分でわかる", "シフトリ"]} textAlign="center" />
          <Box
            w="full"
            aspectRatio="16 / 9"
            overflow="hidden"
            borderWidth="1px"
            borderColor="gray.200"
            borderRadius={{ base: "xl", md: "2xl" }}
            boxShadow="sm"
            bg="white"
          >
            <chakra.video
              ref={videoRef}
              controls
              muted
              playsInline
              preload="none"
              poster={posterImage}
              aria-label="シフトリ紹介動画"
              aria-describedby={descriptionId}
              display="block"
              w="full"
              h="full"
              objectFit="contain"
            >
              <source src={mobileVideoUrl} media={MOBILE_MEDIA_QUERY} type="video/mp4" />
              <source src={desktopVideoUrl} type="video/mp4" />
              お使いのブラウザでは動画を再生できません
            </chakra.video>
          </Box>
          <VisuallyHidden id={descriptionId}>{VIDEO_DESCRIPTION}</VisuallyHidden>
        </VStack>
      </Container>
    </Box>
  );
};

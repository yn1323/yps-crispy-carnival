import { Box, Container, Heading, HStack, Image, Link, List, Stack, Text } from "@chakra-ui/react";
import { LuArrowLeft } from "react-icons/lu";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import excelImage from "./content/images/shift-export/excel.webp";
import exportButtonImage from "./content/images/shift-export/export-button.webp";
import googleSheetsImage from "./content/images/shift-export/google-sheets.webp";
import { HelpAudienceBadge } from "./HelpAudienceBadge";
import { HelpSupport } from "./HelpSupport";
import { SHIFT_EXPORT_HELP } from "./shiftExportHelp";

export function HelpShiftExport() {
  return (
    <PublicPageLayout>
      <Box borderBottomWidth="1px" borderColor="gray.200" bg="gray.50/60">
        <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 7, lg: 10 }}>
          <Stack gap={5} maxW="820px">
            <HStack as="nav" aria-label="パンくず" gap={2} wrap="wrap" color="gray.600" fontSize="sm">
              <Link href="/help" color="teal.700" fontWeight="semibold">
                ヘルプ・使い方
              </Link>
              <Text aria-hidden>/</Text>
              <Text color="gray.700" lineClamp={1}>
                {SHIFT_EXPORT_HELP.title}
              </Text>
            </HStack>
            <Stack gap={3} align="flex-start">
              <HelpAudienceBadge audience={SHIFT_EXPORT_HELP.audience} />
              <Heading
                id="help-shift-export-title"
                as="h1"
                color="gray.950"
                fontSize={{ base: "2xl", lg: "3xl" }}
                lineHeight="1.4"
                letterSpacing="0"
                textWrap="balance"
              >
                {SHIFT_EXPORT_HELP.title}
              </Heading>
              <Text color="gray.700" lineHeight="1.8">
                {SHIFT_EXPORT_HELP.description}
              </Text>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 8, lg: 14 }}>
        <Stack as="article" aria-labelledby="help-shift-export-title" maxW="960px" mx="auto" gap={{ base: 8, lg: 10 }}>
          <Stack as="section" gap={4} aria-labelledby="export-steps-title">
            <Heading id="export-steps-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
              手順
            </Heading>
            <Text color="gray.700" lineHeight="1.8">
              シフトを編集中の場合は、変更を保存してからダウンロードしてください。
            </Text>
            <List.Root as="ol" gap={4} ps={5} color="gray.700">
              <List.Item lineHeight="1.8">シフト一覧から、ダウンロードしたいシフトを開きます。</List.Item>
              <List.Item lineHeight="1.8">
                <strong>PDF・Excel</strong>を選択します。別タブでシフト表のプレビューが開きます。
                <Box mt={4}>
                  <Image
                    src={exportButtonImage}
                    alt="シフト表の画面上部にある「PDF・Excel」ボタンを矢印で示した画面"
                    width={1294}
                    height={720}
                    w="full"
                    h="auto"
                    borderWidth="1px"
                    borderColor="gray.200"
                    borderRadius="lg"
                    decoding="async"
                  />
                  <Link
                    href={exportButtonImage}
                    target="_blank"
                    rel="noopener noreferrer"
                    color="teal.700"
                    fontSize="sm"
                    mt={2}
                  >
                    ボタンの場所を拡大する（別タブ）
                  </Link>
                </Box>
              </List.Item>
              <List.Item lineHeight="1.8">プレビューで、店舗名・期間・スタッフの勤務内容を確認します。</List.Item>
              <List.Item lineHeight="1.8">
                印刷用なら<strong>PDF</strong>、表を編集して使うなら<strong>Excel</strong>を選択して保存します。
              </List.Item>
            </List.Root>
          </Stack>

          <Stack as="section" gap={3} aria-labelledby="export-trouble-title">
            <Heading id="export-trouble-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
              うまくいかないとき
            </Heading>
            <Text color="gray.700" lineHeight="1.8">
              ダウンロードが始まらない場合は、出力画面に表示される<strong>ここ</strong>のリンクから保存してください。
            </Text>
          </Stack>
          <Stack as="section" gap={5} aria-labelledby="export-examples-title">
            <Stack gap={3}>
              <Heading id="export-examples-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
                Excel・Google スプレッドシートにも対応！
              </Heading>
              <Text color="gray.700" lineHeight="1.8">
                ダウンロードしたExcelファイルは、ExcelやGoogle スプレッドシートで開いて編集できます。
              </Text>
            </Stack>
            {[
              { title: "Excel", src: excelImage, width: 1186 },
              { title: "Google スプレッドシート", src: googleSheetsImage, width: 1183 },
            ].map((example) => (
              <Stack as="figure" key={example.title} m={0} gap={3}>
                <Box as="figcaption">
                  <Heading as="h3" color="gray.950" fontSize="lg">
                    {example.title}の表示例
                  </Heading>
                </Box>
                <Image
                  src={example.src}
                  alt={`${example.title}で開いたシフト表。スタッフごとの勤務区分が日付別に表示されています。`}
                  width={example.width}
                  height={720}
                  w="full"
                  h="auto"
                  borderWidth="1px"
                  borderColor="gray.200"
                  borderRadius="lg"
                  loading="lazy"
                  decoding="async"
                />
                <Link
                  href={example.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  color="teal.700"
                  fontSize="sm"
                  w="fit-content"
                >
                  {example.title}の表示例を拡大する（別タブ）
                </Link>
              </Stack>
            ))}
          </Stack>
          <Link
            href="/help"
            color="teal.700"
            fontWeight="bold"
            display="flex"
            alignItems="center"
            gap={2}
            w="fit-content"
          >
            <LuArrowLeft aria-hidden />
            ヘルプ・使い方TOPに戻る
          </Link>
          <HelpSupport />
        </Stack>
      </Container>
    </PublicPageLayout>
  );
}

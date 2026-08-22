import { Box, Link, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";
import { LegalPage } from "@/src/components/shared/LegalDocumentPage";

// Production公開前に実在する情報へ置換する。下記の仮入力をすべて置換すると画面上の注意表示も消える。
const MANUAL_BUSINESS_DETAILS = {
  businessName: "【手動入力：登記上の法人名、戸籍上の氏名または登記された商号】",
  responsiblePerson: "【手動入力：代表者または通信販売業務責任者の氏名】",
  address: "【手動入力：番地まで含む所在地】",
  phoneNumber: "【手動入力：確実に連絡できる電話番号】",
} as const;

// Stripe Priceはコードへ固定しない契約のため、Production公開前に確定した表示額を入力する。
const MANUAL_SALES_PRICES = {
  pro: "【手動入力：Proの月額料金と税込・税別】",
  business: "【手動入力：Businessの月額料金と税込・税別】",
} as const;

const hasManualDisclosure = [...Object.values(MANUAL_BUSINESS_DETAILS), ...Object.values(MANUAL_SALES_PRICES)].some(
  (value) => value.startsWith("【手動入力："),
);

const freeLimits = ORGANIZATION_PLAN_LIMITS.free;
const proLimits = ORGANIZATION_PLAN_LIMITS.pro;
const businessLimits = ORGANIZATION_PLAN_LIMITS.business;

type DisclosureRow = {
  label: string;
  content: ReactNode;
};

const disclosureRows: DisclosureRow[] = [
  {
    label: "サービス名",
    content: "シフト管理SaaS「シフトリ」",
  },
  {
    label: "役務提供事業者",
    content: MANUAL_BUSINESS_DETAILS.businessName,
  },
  {
    label: "運営責任者",
    content: MANUAL_BUSINESS_DETAILS.responsiblePerson,
  },
  {
    label: "所在地",
    content: MANUAL_BUSINESS_DETAILS.address,
  },
  {
    label: "電話番号",
    content: MANUAL_BUSINESS_DETAILS.phoneNumber,
  },
  {
    label: "お問い合わせ",
    content: (
      <>
        <Link href="/contact" color="teal.700" fontWeight="semibold">
          お問い合わせフォーム
        </Link>
        からご連絡ください。
      </>
    ),
  },
  {
    label: "販売価格",
    content: (
      <Stack gap={1}>
        <Text>Pro：{MANUAL_SALES_PRICES.pro}</Text>
        <Text>Business：{MANUAL_SALES_PRICES.business}</Text>
        <Text>
          契約画面でも、契約を確定する前に金額、通貨、税込・税別、請求周期を表示します。初回登録で利用できる範囲は
          <Link href="/pricing" color="teal.700" fontWeight="semibold">
            料金・プラン
          </Link>
          で確認できます。
        </Text>
      </Stack>
    ),
  },
  {
    label: "販売価格以外に必要な費用",
    content:
      "消費税は契約画面に表示する税込・税別の条件に従います。当サービスへお支払いいただくその他の手数料はありません。インターネット接続料金、通信料金、利用端末の費用は利用者の負担となります。",
  },
  {
    label: "支払方法",
    content: "クレジットカード決済（Stripe）",
  },
  {
    label: "支払時期",
    content:
      "追加組織のFreeプランから有料プランの契約を開始した場合は、契約開始時に初回料金を請求します。契約制限中などから有料プランを開始する場合も、契約開始時に初回料金を請求します。以後は1か月ごとの更新日に請求します。",
  },
  {
    label: "役務の提供時期",
    content:
      "初回登録で作る最初の組織と、二つ目以降の組織のFreeプランは、組織の作成完了後から利用できます。有料プランは、Stripeで契約状態を確認した後に提供を開始します。",
  },
  {
    label: "申込期間",
    content: "申込期間の定めはありません。",
  },
  {
    label: "契約期間と自動更新",
    content:
      "有料プランの契約期間は1か月です。解約手続きが完了するまで、1か月ごとに自動更新します。次回更新日はサービス画面に表示します。",
  },
  {
    label: "初回登録",
    content: `初回登録で作成する最初の組織には、支払い不要のBusinessを適用します。無料体験の終了日は設定せず、支払い方法の登録を求めません。この組織では、利用人数${businessLimits.maxPeople}名、稼働店舗${businessLimits.maxActiveShops}件、有効な管理ユーザー${businessLimits.maxActiveManagers}名まで利用できます。`,
  },
  {
    label: "追加組織のFreeプラン",
    content:
      "二つ目以降の組織にはFreeプランを適用します。Freeプランから有料プランへ変更する場合は、契約画面で支払い方法を登録します。",
  },
  {
    label: "解約と返金",
    content:
      "有料プランは、組織設定の「プランと支払い」から解約できます。解約は現在の契約期間の終了時に適用し、それまでは利用できます。解約後はデータを保持したまま組織の業務操作を制限します。解約手数料はありません。デジタルサービスの性質上、提供開始後の返品は受け付けていません。法令上必要な場合または契約確定前に別途表示する場合を除き、支払い済み料金の日割り返金は行いません。",
  },
  {
    label: "利用上限",
    content: `初回登録で作る最初の組織は、利用人数${businessLimits.maxPeople}名、稼働店舗${businessLimits.maxActiveShops}件、有効な管理ユーザー${businessLimits.maxActiveManagers}名までです。追加組織のFreeプランは利用人数${freeLimits.maxPeople}名、稼働店舗${freeLimits.maxActiveShops}件、有効な管理ユーザー${freeLimits.maxActiveManagers}名まで、Proは利用人数${proLimits.maxPeople}名、稼働店舗${proLimits.maxActiveShops}件、有効な管理ユーザー${proLimits.maxActiveManagers}名まで、Businessは利用人数${businessLimits.maxPeople}名、稼働店舗${businessLimits.maxActiveShops}件、有効な管理ユーザー${businessLimits.maxActiveManagers}名まで利用できます。`,
  },
  {
    label: "動作環境",
    content:
      "動作確認の基準環境は、PCおよびモバイル端末のGoogle Chromeです。JavaScriptとCookieを利用できるブラウザ、およびインターネット接続環境が必要です。一部の通知機能には、LINEまたはメールを受信できる環境が必要です。その他の環境で利用する場合は、利用開始前に無料デモで動作を確認してください。",
  },
];

export function CommercialTransactions(): ReactNode {
  return (
    <LegalPage title="特定商取引法に基づく表記" lastUpdated="2026年8月22日">
      <Stack gap={6}>
        <Text textStyle="bodySm" color="fg.muted" lineHeight={1.8}>
          初回登録と追加組織の利用条件、有料プランに関する販売条件を表示します。
        </Text>

        {hasManualDisclosure ? (
          <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg" px={4} py={3}>
            <Text textStyle="bodySm" color="orange.900" lineHeight={1.8} fontWeight="semibold">
              事業者名、運営責任者、所在地、電話番号、Pro・Businessの販売価格は仮入力です。Production公開前に実在する情報と確定した価格へ置き換えてください。
            </Text>
          </Box>
        ) : null}

        <Box as="dl" borderWidth="1px" borderColor="gray.200" borderRadius="xl" overflow="hidden">
          {disclosureRows.map((row, index) => (
            <Box
              key={row.label}
              display="grid"
              gridTemplateColumns={{ base: "1fr", md: "180px minmax(0, 1fr)" }}
              gap={{ base: 2, md: 6 }}
              px={{ base: 4, md: 5 }}
              py={{ base: 4, md: 5 }}
              borderTopWidth={index === 0 ? "0" : "1px"}
              borderColor="gray.200"
            >
              <Text as="dt" fontWeight="bold" color="fg" textStyle="bodySm">
                {row.label}
              </Text>
              <Text as="dd" m={0} color="fg.muted" textStyle="bodySm" lineHeight={1.8}>
                {row.content}
              </Text>
            </Box>
          ))}
        </Box>
      </Stack>
    </LegalPage>
  );
}

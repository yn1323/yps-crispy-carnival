import { buildLinks, buildMeta } from "@/src/lib/seo";

export function buildCommercialTransactionsPageHead() {
  return {
    links: buildLinks({ canonical: "/commercial-transactions" }),
    meta: buildMeta({
      title: "特定商取引法に基づく表記",
      description: "シフトリの有料プランに関する販売条件と事業者情報",
      canonical: "/commercial-transactions",
      noindex: true,
    }),
  };
}

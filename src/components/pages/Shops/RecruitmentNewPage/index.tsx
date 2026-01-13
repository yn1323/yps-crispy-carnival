import { RecruitmentNew } from "@/src/components/features/Shift/RecruitmentNew";

type Props = {
  shopId: string;
};

// モックデータ（将来的にはuseQueryで取得）
// const mockShop = {
//   _id: "shop_1" as const,
//   shopName: "サンプル店舗",
// };

export const RecruitmentNewPage = ({ shopId }: Props) => {
  // 将来的にはuseQueryでデータ取得
  // const shop = useQuery(api.shop.queries.getById, { shopId: shopId as Id<"shops"> });

  // 将来的なローディング・エラー処理
  // if (shop === undefined) {
  //   return <LoadingState />;
  // }
  // if (shop === null) {
  //   return <NotFoundState />;
  // }

  return <RecruitmentNew shopId={shopId} />;
};

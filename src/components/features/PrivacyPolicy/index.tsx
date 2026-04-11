import { Link } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Body, BulletList, LegalPage, Section, SubHeading } from "@/src/components/features/LegalPage";

export function PrivacyPolicy(): ReactNode {
  return (
    <LegalPage title="プライバシーポリシー" lastUpdated="2026年4月11日">
      <Body>
        シフトリ（以下「本サービス」）は、個人情報の保護を重視しています。本ポリシーでは、本サービスが取得する情報とその取り扱いについて説明します。
      </Body>

      <Section title="1. 取得する情報">
        <Body>本サービスでは以下の情報を取得します。</Body>
        <SubHeading>管理者（店舗オーナー・店長）：</SubHeading>
        <BulletList
          items={["メールアドレス（Clerkを通じた認証に使用）", "店舗名・営業時間などの店舗情報（サービス提供に使用）"]}
        />
        <SubHeading>スタッフ：</SubHeading>
        <BulletList
          items={[
            "氏名（管理者が登録）",
            "メールアドレス（シフト募集・確定の通知に使用）",
            "シフト希望データ（勤務可能な日時の情報）",
          ]}
        />
      </Section>

      <Section title="2. 利用目的">
        <Body>取得した情報は以下の目的で利用します。</Body>
        <BulletList
          items={[
            "シフト募集の通知メール送信",
            "シフト確定の通知メール送信",
            "マジックリンクによるシフト提出画面へのアクセス提供",
            "サービスの提供・運営・改善",
          ]}
        />
      </Section>

      <Section title="3. 外部サービスの利用">
        <Body>本サービスでは以下の外部サービスを利用しており、これらのサービスに情報が送信されます。</Body>
        <BulletList
          items={[
            "Clerk（認証基盤）：管理者のメールアドレス・認証情報",
            "Convex（データベース）：店舗情報・スタッフ情報・シフトデータ",
            "Resend（メール配信）：スタッフのメールアドレス・氏名",
            "Vercel（ホスティング）：アクセスログ",
          ]}
        />
        <Body>各サービスのプライバシーポリシーについては、各サービスのWebサイトをご確認ください。</Body>
      </Section>

      <Section title="4. 第三者提供">
        <Body>
          法令に基づく場合を除き、本人の同意なく個人情報を第三者に提供することはありません。前項の外部サービスは、本サービスの運営に必要な業務委託先として利用しています。
        </Body>
      </Section>

      <Section title="5. データの保管">
        <Body>データはConvexのクラウドサーバーに保管されます。不要になったデータは管理者が削除できます。</Body>
      </Section>

      <Section title="6. お問い合わせ">
        <Body>個人情報の取り扱いに関するお問い合わせは、以下のフォームからご連絡ください。</Body>
        {/* TODO: Google Form URL に差し替え */}
        <Link href="#" color="teal.700" fontSize={{ base: "14px", lg: "15px" }}>
          お問い合わせフォーム
        </Link>
      </Section>
    </LegalPage>
  );
}

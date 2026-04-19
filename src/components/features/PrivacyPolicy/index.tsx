import { Link } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Body, BulletList, LegalPage, Section, SubHeading } from "@/src/components/features/LegalPage";

export function PrivacyPolicy(): ReactNode {
  return (
    <LegalPage title="プライバシーポリシー" lastUpdated="2026年4月19日">
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

      <Section title="4. アクセス解析ツールの利用">
        <Body>
          本サービスでは、サイトの利用状況を把握し、サービスの改善に役立てるため、以下のアクセス解析ツールを利用しています。これらのツールはCookieを使用して情報を収集し、収集された情報は各提供元のサーバー（日本国外を含む）に送信されます。
        </Body>

        <SubHeading>Google Analytics（Google Tag Manager経由）：</SubHeading>
        <BulletList
          items={[
            "提供元：Google LLC",
            "利用目的：サイト利用状況の分析およびサービスの改善",
            "取得する情報：ページ閲覧状況、参照元、デバイス情報、ブラウザ情報、IPアドレス（Google側で匿名化処理が行われます）",
            "使用するCookie：_ga、_ga_* など",
            "データの保存先：Googleのサーバー（海外への移転を含みます）",
            "保存期間：最大14か月",
            "オプトアウト方法：ブラウザのCookie削除、またはGoogle Analyticsオプトアウトアドオンの利用",
          ]}
        />
        <Body>
          Googleのプライバシーポリシーの詳細は
          <Link href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" color="teal.700">
            https://policies.google.com/privacy
          </Link>
          をご確認ください。
        </Body>

        <SubHeading>Microsoft Clarity：</SubHeading>
        <BulletList
          items={[
            "提供元：Microsoft Corporation",
            "利用目的：ユーザー体験の分析および改善",
            "取得する情報：ページ閲覧状況、クリック、スクロール、マウス移動、デバイス情報、ブラウザ情報、IPアドレス（国判定の用途で利用され、Microsoftによれば保存はされません）",
            "入力値の扱い：マスクレベルStrictにより、氏名・メールアドレスなどフォームに入力された内容は記録されません",
            "使用するCookie：_clck、_clsk",
            "データの保存先：Microsoftのサーバー（海外への移転を含みます）",
            "保存期間：最大1年（ローリングで自動削除されます）",
            "オプトアウト方法：ブラウザのCookie削除、またはトラッキング防止機能の利用",
          ]}
        />
        <Body>
          Microsoftのプライバシーポリシーの詳細は
          <Link
            href="https://privacy.microsoft.com/privacystatement"
            target="_blank"
            rel="noopener noreferrer"
            color="teal.700"
          >
            https://privacy.microsoft.com/privacystatement
          </Link>
          をご確認ください。
        </Body>
      </Section>

      <Section title="5. 第三者提供">
        <Body>
          法令に基づく場合を除き、本人の同意なく個人情報を第三者に提供することはありません。前各項の外部サービスおよびアクセス解析ツールは、本サービスの運営に必要な業務委託先として利用しています。
        </Body>
      </Section>

      <Section title="6. データの保管">
        <Body>データはConvexのクラウドサーバーに保管されます。不要になったデータは管理者が削除できます。</Body>
      </Section>

      <Section title="7. お問い合わせ">
        <Body>個人情報の取り扱いに関するお問い合わせは、以下のフォームからご連絡ください。</Body>
        <Link
          href="https://forms.gle/wBHKJtD6YAHmAWP9A"
          target="_blank"
          rel="noopener noreferrer"
          color="teal.700"
          fontSize={{ base: "14px", lg: "15px" }}
        >
          お問い合わせフォーム
        </Link>
      </Section>
    </LegalPage>
  );
}

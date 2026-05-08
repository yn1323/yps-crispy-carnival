import { Link } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { getLegalDocumentsForAudience, type LegalAudience } from "@/convex/legal/documents";
import { Body, BulletList, LegalPage, Section, SubHeading } from "@/src/components/features/LegalPage";

type Props = {
  audience?: LegalAudience;
};

export function PrivacyPolicy({ audience = "manager" }: Props): ReactNode {
  const documents = getLegalDocumentsForAudience(audience);
  const isStaff = audience === "staff";
  const title = isStaff ? "スタッフ向けプライバシーポリシー" : "管理ユーザー向けプライバシーポリシー";

  return (
    <LegalPage title={title} lastUpdated="2026年5月9日">
      <Body>
        シフト管理SaaS「シフトリ」は、個人情報の保護を重視しています。本ポリシーでは、
        {isStaff
          ? "スタッフの方がシフト提出や通知受信を行う際に取り扱う情報"
          : "管理ユーザーの方が店舗管理やスタッフ管理を行う際に取り扱う情報"}
        について説明します。
      </Body>

      <Section title="1. 取得する情報">
        {isStaff ? (
          <>
            <SubHeading>スタッフに関する情報</SubHeading>
            <BulletList
              items={[
                "氏名、メールアドレス",
                "シフト希望、提出日時、確定シフトの閲覧状況",
                "LINE連携を行った場合のLINEユーザー識別子、連携日時、友だち追加状態",
                "利用規約・プライバシーポリシーへの同意日時と同意バージョン",
              ]}
            />
          </>
        ) : (
          <>
            <SubHeading>管理ユーザーに関する情報</SubHeading>
            <BulletList
              items={[
                "氏名、メールアドレス、認証に必要な情報",
                "店舗名、営業時間などの店舗情報",
                "登録したスタッフ情報、シフト募集・確定に関する情報",
                "利用規約・プライバシーポリシーへの同意日時と同意バージョン",
              ]}
            />
          </>
        )}
      </Section>

      <Section title="2. 利用目的">
        <BulletList
          items={
            isStaff
              ? [
                  "シフト希望の提出、確認、修正のため",
                  "シフト募集、催促、確定シフトをメールまたはLINEで通知するため",
                  "LINE連携状態を管理し、通知経路を切り替えるため",
                  "利用規約・プライバシーポリシーへの同意状態を確認するため",
                ]
              : [
                  "アカウント認証と店舗管理機能を提供するため",
                  "スタッフ登録、シフト募集、シフト作成、通知送信を行うため",
                  "サービスの保守、改善、問い合わせ対応のため",
                  "利用規約・プライバシーポリシーへの同意状態を確認するため",
                ]
          }
        />
      </Section>

      <Section title="3. 外部サービス">
        <Body>
          本サービスでは、認証、データ保存、メール送信、LINE通知、アクセス解析のために外部サービスを利用する場合があります。取り扱われる情報は、サービス提供に必要な範囲に限ります。
        </Body>
        <BulletList
          items={[
            "Clerk: 認証基盤",
            "Convex: データベース、アプリケーション基盤",
            "Resend: メール配信",
            "LINEヤフー: LINE連携、LINE通知",
            "Vercel、Google Analytics、Microsoft Clarity: ホスティング、アクセス解析、改善",
          ]}
        />
      </Section>

      <Section title="4. 第三者提供">
        <Body>
          法令に基づく場合を除き、本人の同意なく個人情報を第三者に提供しません。外部サービスの利用は、本サービス運営に必要な業務委託として行います。
        </Body>
      </Section>

      <Section title="5. 問い合わせ">
        <Body>個人情報の取り扱いに関する問い合わせは、サービス上のお問い合わせフォームからご連絡ください。</Body>
        <Body>
          関連する利用条件は
          <Link href={documents.terms.path} color="teal.700">
            {documents.terms.title}
          </Link>
          をご確認ください。
        </Body>
        <Body>文書バージョン: {documents.privacy.documentVersion}</Body>
      </Section>
    </LegalPage>
  );
}

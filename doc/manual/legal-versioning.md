# 法務文書のバージョン更新メモ

利用規約・プライバシーポリシーを変更したときに、同意バージョンの更新を忘れないための備忘録です。

## 更新する場所

現在有効な文書バージョンは `convex/legal/documents.ts` にあります。

- 管理ユーザー向け利用規約: `LEGAL_DOCUMENTS.manager.terms.version`
- 管理ユーザー向けプライバシーポリシー: `LEGAL_DOCUMENTS.manager.privacy.version`
- スタッフ向け利用規約: `LEGAL_DOCUMENTS.staff.terms.version`
- スタッフ向けプライバシーポリシー: `LEGAL_DOCUMENTS.staff.privacy.version`

文書本文は以下のコンポーネントを更新します。

- 利用規約: `src/components/features/Terms/index.tsx`
- プライバシーポリシー: `src/components/features/PrivacyPolicy/index.tsx`

## 手順

1. 対象文書の本文を更新する。
2. `convex/legal/documents.ts` の対象 `version` を新しい値にする。
3. `lastUpdated` の表示日も必要に応じて更新する。
4. `pnpm lint` と `pnpm type-check` を実行する。

## バージョン命名

基本は `audience-kind-YYYY-MM-DD` にします。

- 例: `manager-terms-2026-05-09`
- 例: `staff-privacy-2026-05-09`

同じ日に複数回変更する場合は末尾に `-2` などを付けます。

## 再同意が必要な変更

以下のような変更では、バージョンを必ず上げます。

- 取得する個人情報の種類を増やす
- 利用目的を追加または大きく変更する
- 外部サービスや第三者提供の扱いを変更する
- 免責、禁止事項、サービス利用条件を利用者に不利な方向へ変更する
- スタッフの同意が必要な操作や通知の扱いを変更する

誤字修正や表現の軽微な調整だけなら、バージョンを上げない判断もできます。

## 動作メモ

- バージョンを上げると、既存の同意は旧バージョン扱いになります。
- スタッフは未同意でもシフト募集・催促・確定通知を受け取れます。
- スタッフはシフト提出時に最新バージョンへ同意していない場合、チェックボックスで同意してから提出します。
- スタッフ同意メールのリンクは30日間有効です。

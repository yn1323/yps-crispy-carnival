# 法務文書のバージョン更新メモ

利用規約・プライバシーポリシーを更新するときの備忘録です。  
このアプリでは「文書そのものの版」と「再同意を求める版」を分けています。

## 更新する場所

現在の文書情報は `convex/legal/documents.ts` の `LEGAL_DOCUMENTS` で管理します。

- 管理ユーザー向け利用規約: `LEGAL_DOCUMENTS.manager.terms`
- 管理ユーザー向けプライバシーポリシー: `LEGAL_DOCUMENTS.manager.privacy`
- スタッフ向け利用規約: `LEGAL_DOCUMENTS.staff.terms`
- スタッフ向けプライバシーポリシー: `LEGAL_DOCUMENTS.staff.privacy`

各文書には2種類の版があります。

- `documentVersion`: 本文を更新したら上げる版
- `requiredConsentVersion`: 再同意が必要な変更の時だけ上げる版

文書本文は以下を更新します。

- 利用規約: `src/components/features/Terms/index.tsx`
- プライバシーポリシー: `src/components/features/PrivacyPolicy/index.tsx`

## 軽微な修正の場合

誤字修正、表現の調整、説明の補足など、再同意までは不要な変更です。

1. 本文を更新する。
2. 対象文書の `documentVersion` を上げる。
3. 画面表示の `lastUpdated` も必要に応じて更新する。
4. `requiredConsentVersion` は変更しない。

この場合、既存ユーザー・スタッフに再同意は求められません。

## 再同意が必要な変更の場合

取得する個人情報、利用目的、外部サービス、通知や操作条件、免責・禁止事項など、利用者の判断に影響する変更です。

1. 本文を更新する。
2. 対象文書の `documentVersion` を上げる。
3. 対象文書の `requiredConsentVersion` も上げる。
4. 画面表示の `lastUpdated` も更新する。

`requiredConsentVersion` を上げると、保存済みの同意版と一致しなくなるため再同意が必要になります。

- 管理ユーザー: ダッシュボード上部に再同意バナーが表示されます。
- スタッフ: シフト提出時に同意チェックボックスが表示されます。

## 命名ルール

基本は用途が分かる名前にします。

- 文書版: `audience-kind-doc-YYYY-MM-DD`
- 同意要求版: `audience-kind-consent-YYYY-MM-DD`

例:

- `manager-terms-doc-2026-05-09`
- `manager-terms-consent-2026-05-09`
- `staff-privacy-doc-2026-05-09`
- `staff-privacy-consent-2026-05-09`

同じ日に複数回上げる場合は末尾に `-2` などを付けます。

## 動作メモ

- 同意判定は `requiredConsentVersion` だけを見ます。
- 同意履歴には、同意要求版と実際に同意した文書版の両方を保存します。
- スタッフは未同意でもシフト募集・催促・確定通知を受け取れます。
- スタッフ同意メールのリンクは30日間有効です。
- 管理ユーザーの再同意バナーは表示だけで、ダッシュボード操作はブロックしません。

## 確認手順

1. `convex/legal/documents.ts` の対象文書が意図した版になっていることを確認する。
2. 軽微な修正なら `requiredConsentVersion` を変えていないことを確認する。
3. 再同意が必要な修正なら `requiredConsentVersion` も上げたことを確認する。
4. `pnpm lint` と `pnpm type-check` を実行する。

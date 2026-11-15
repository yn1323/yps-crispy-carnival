---
paths:
  - "**/*.stories.tsx"
---

# Storyの書き方

Storybookは「UI状態の棚卸し」と「画面上の軽い振る舞い」を守る場所。
play functionは振る舞い、VRTは見た目で役割を分ける。
テスト層の選び方は `doc/rules/testing-strategy.md` と `test-strategy` を正本とする。

## Storyの作り方

- UIを追加・変更したら、同階層の `index.stories.tsx` を作成または更新する。
- `Meta` と `StoryObj` は `@storybook/react-vite` からimportする。`@storybook/react` は使わない。
- 代表状態、空状態、エラー状態、長文、権限差、モバイル差分をStoryとして置く。
- VRTはキャプチャ数の制限がない前提なので、状態ごとに個別Storyを基本にする。
- 小さいUI部品だけはVariants Storyにまとめてよい。
- VRT対象Storyに最初から表示される見出し、説明、ラベル、件数などは、静的な見た目と文言としてVRTへ委ねる。

## play functionの書き方

- `storybook/test` から `expect`, `userEvent`, `within` を使う。
- Storyから `vitest` の `expect` をimportしない。
- `@storybook/test` はインストールされていない。`fn()` は使わず、必要なcallbackは `() => {}` を直接渡す。
- 出現待ちは `findBy...` を優先する。
- `waitFor` は消滅、transition、件数変化など `findBy...` では意図が読みにくい時に限定する。
- 「押せる」「進める」「エラーが見える」「確認文言が出る」など、ユーザー操作後の見える結果を `expect(...)` で書く。
- カスタムhelperが手動でthrowするより、Testing Libraryのqueryと `expect` で意図を見せる。
- 初期表示の静的文言があることだけを確認するplay functionは書かない。`assertText`、`textContent.includes`、`getByText`だけで終わるplayは原則削除する。
- 操作によって初めて表示・非表示・更新されるvalidation error、確認画面、成功・失敗状態、件数変化はBehavior Testで検証する。
- lazy mountするtabまたはDialogは、利用者の操作で表示を開始し、`findBy...`で局所Loading後の内容を確認する。
- 再表示時の入力保持またはresetが製品契約なら、閉じる前の状態を作ってから再表示して確認する。
- dynamic importの失敗が利用者に見える場合は、代表Storyで局所Errorと再試行または再読み込みの導線を確認する。
- 操作対象を取得するためのrole/name指定はテスト手段として使ってよいが、同じ静的文言を別assertで重複確認しない。
- URL、status、error code、JSON-LD、検索対象データ、法務version、sanitize結果、個人情報のマスキングは、文字列自体が機械契約またはセキュリティ契約なのでVRTだけに委ねない。

## 避けること

- DB状態やAPI副作用をStorybookで保証しない。
- ピクセル差分をBehavior Testのassertionで代用しない。
- VRTで守れる初期表示の静的文言をBehavior Testで重複保証しない。
- 個人情報の非露出や機械可読データまで「静的文言」として削除しない。
- 表示される文言を無意味に曖昧な正規表現へ寄せすぎない。ユーザーに見える重要文言は明示する。

## VRT対象の判断

- 見た目も守りたいStoryはVRT対象に残す。
- 振る舞いだけを見たいStoryは `parameters: { screenshot: { skip: true } }` を付ける。
- play functionの途中状態を撮りたい場合は、静的Storyに代表状態を切り出す。
- `position: fixed` のHeaderを含む縦長ページをfull-page VRTで撮る場合は `parameters.vrt.releaseFixedHeader = true` を付ける。
- モバイルStoryはviewport指定と対応する`vrt-mobile1`または`vrt-mobile2` tagをセットで付ける。
- viewport指定だけではモバイルVRT projectの対象にならないため、tagなしを見逃さない。

## VRTの実行と確認

- VRT対象のStory、`parameters`、tagは変更契約に合わせて更新する。
- 通常の実装作業では、ローカルの`pnpm vrt`、screenshot capture、RegSuit compare、画像差分の目視確認を実行しない。
- VRTのbuild、capture、差分確認、承認、baseline更新はGitHub ActionsのVRT workflowへ委ねる。
- ユーザーがローカル実行を明示した場合、またはVRT workflow自体を診断する場合だけ、必要なVRT commandをローカルで実行する。
- 既定方針によりVRTをローカル実行しなかった場合は、完了報告で「VRTはCI確認方針のため未実行」と示し、環境失敗や検証漏れとして扱わない。
- CIで差分が出た場合は、意図した変更かを確認し、理由を説明できる状態にする。
- VRT差分だけでロジックの正しさを判断しない。
- 静的文言の追加・削除・改行・長文崩れはVRTで確認し、同じStoryへ存在確認だけのplayを足さない。
- PRではbaseline欠落を成功扱いにせず、意図した差分だけを承認する。
- CIでの対象、承認、レポート公開、baseline更新は、現在の `.github/workflows/` と `.github/AGENTS.md` を正本とする。

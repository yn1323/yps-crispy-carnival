# E2E テスト規約

## 目的

既存テスト層（convex-test / Vitest / Storybook+Chromatic）がカバーできない **「繋がり」の検証**。
画面遷移・認証・フロント⇔Convex結合・ハッピーパスが壊れていないことを保証する。

### テストしないこと

- 外部サービスの動作（Resend、Clerkの認証画面）
- 例外フロー・エラーハンドリング（ユニットテストの責務）
- ピクセルパーフェクトなUI（Storybook+Chromaticの責務）
- メール送信の成否（UI層の成功トースト+送信済み表示のみ検証）
- SP表示（MVP段階ではPC主体）

## ディレクトリ構造

```
e2e/
├── pages/                                # POM（画面操作クラス）
│   ├── DashboardPage.ts                  #   セットアップ、スタッフ追加、募集作成
│   ├── ShiftBoardPage.ts                 #   シフト編集、保存、送信
│   └── StaffViewPage.ts                  #   マジックリンク閲覧、リンク再発行
├── scenarios/                            # テストファイル（ユーザーストーリー名で命名）
│   └── first-shift-delivery.test.ts
├── fixtures/
│   └── auth.setup.ts                     # Clerk認証セットアップ
├── .clerk/                               # 認証状態（storageState）
└── .tmp/                                 # テスト実行時の一時ファイル
```

## テスト設計

### POM + 1ファイル + `test.step`

- **Pageクラス**: 画面操作を最初から全てPageクラスに切り出す。シナリオ側には操作の詳細を書かない
- **テストファイル**: ユーザーストーリー名で命名。`test.step()` でステップを区切る
- 1ファイルにまとめることでシナリオ間のデータ受け渡し問題を回避する

### 進化パス

テストファイルが長くなったら（目安: 200行超）ユーザーストーリー単位で分割する。
分割時の実行順序は `playwright.config.ts` の `projects.dependencies` で宣言的に制御する。ファイル名に番号を付けない。

## 認証

- `fixtures/auth.setup.ts` で `@clerk/testing` の `setupClerkTestingToken` を利用
- CIでは環境変数 `E2E_CLERK_USER` / `E2E_CLERK_PASSWORD` を使用

## データ

- **CI**: `pnpm convex:import` で空DBシードをインポート → テストは初回セットアップから開始
- **ローカル**: `convex dev` + ローカルDB

## セレクター

優先順位: `getByRole` / `getByText` > `getByTestId` > CSSセレクター

`data-testid` はセマンティックなセレクターで特定できない場合のみ付与する。

## ルール

- `page.waitForTimeout()` 禁止。`expect().toBeVisible()` 等で待機する
- CSSセレクター（`.chakra-button` 等）に依存しない
- ガントチャートのドラッグ操作はE2Eでは最小限の検証のみ（精密な時間検証はユニットテスト側）
- mutation成功はトースト表示で判定する（DB直接確認は不要）

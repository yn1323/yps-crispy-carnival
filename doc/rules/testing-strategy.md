# テスト方針

## 目的

このドキュメントは、YPS のテストをどの層に分け、どの粒度で書くかを定義する。特に、E2E では遅すぎ、フロントエンドのユニットテストでは狭すぎる業務フローを、Convex Scenario Test で検証する方針を明確にする。

## 基本方針

- テストは「速く細かいもの」と「遅いが実環境に近いもの」を分ける。
- 複雑な DB 状態遷移は E2E に寄せすぎず、Convex Scenario Test で厚く見る。
- E2E は画面・認証・フロントエンドと実 Convex backend の接続確認に絞る。
- すべての分岐を同じ層で網羅しない。境界値は Logic UT / Function Test、業務状態遷移は Scenario Test、画面の完了確認は E2E に分担する。

## テスト種別

| 種類 | コマンド/場所 | 目的 | 書くこと | 書かないこと |
|---|---|---|---|---|
| Logic UT | `pnpm test:logic`, `src/**/*.test.ts` | 純粋ロジックの退行検知 | 日付、時刻、配列加工、schema、表示変換、フォーム固有の純粋validation | DB、React表示、Convex接続 |
| UI Component Test | `pnpm test:ui`, `*.stories.tsx` | Storybook 上の表示・軽い操作確認 | 代表状態、空/エラー/長文状態、重要な操作の play test | 業務フロー全体、DB状態検証 |
| VRT | Chromatic / Storybook | 見た目差分検知 | 代表パターン、variants、状態別Story | ロジック検証、業務状態遷移 |
| Convex Function Test | `pnpm test:convex`, `convex/{useCase}/*.test.ts` | query/mutation 単体の契約確認 | 認証、認可、IDOR、論理削除、返り値制限、副作用、空データ | 複数ドメインをまたぐ長い業務フロー |
| Convex Scenario Test | `pnpm test:convex`, `convex/_scenario/*.test.ts` | 複雑な業務状態遷移の検証 | 複数 mutation/query の連続実行、集計、スナップショット、最終DB状態、業務上重要なエッジケース | ブラウザ操作、見た目、実 Convex deployment 接続 |
| E2E | `pnpm e2e`, `e2e/scenarios/*.test.ts` | 実 frontend + 実 Convex backend の最終結合確認 | 主要ハッピーパス、認証、画面遷移、ユーザーに見える成功状態 | DB細部の網羅、全分岐、ピクセルパーフェクト |

## Convex Scenario Test

Convex Scenario Test は、`convex-test` を使ってユーザーの複雑な業務シナリオを Convex 関数ベースで検証する。`convex-test` はテスト用の mock Convex backend と隔離DBを使うため、dev / preview / prod の実DBは使わない。

この層は、本プロジェクトにおける Convex IT 相当のテストとして扱う。主要な正常系だけでなく、業務フロー上で壊れると影響が大きいエッジケースまで検証する。

### 位置づけ

E2E 未満、Convex Function Test 以上の層として扱う。

```text
seed
  -> mutation A
  -> query で中間状態確認
  -> mutation B
  -> update/delete/論理削除
  -> query で最終DTO・DB状態確認
```

### 横断シナリオ

横断シナリオとは、1つの Convex useCase だけでは完結せず、複数の useCase をまたぐ業務フローのこと。

例:

```text
recruitment.mutations.createRecruitment
  -> shiftSubmission.mutations.submitShiftRequests
  -> shiftBoard.mutations.saveDraft
  -> shiftBoard.mutations.confirm
  -> dashboard.queries.getDashboardRecruitments
  -> notification.queries.getConfirmationEmailData
```

このようなシナリオは `convex/_scenario/` に置く。単一 useCase に閉じる契約確認は、従来通り `convex/{useCase}/queries.test.ts` や `convex/{useCase}/mutations.test.ts` に置く。

### 配置

```text
convex/
  _scenario/
    shiftCreation.test.ts
    notificationLifecycle.test.ts
  _test/
    setup.test-helper.ts
    fixtures.ts
    assertions.ts
    scenarioBuilders.ts
```

`convex/_test/` は helper や fixture の置き場、`convex/_scenario/` はシナリオ本体の置き場とする。

### 粒度

- 大きな業務単位を `describe` にする。
- 派生シナリオを `it` に分ける。
- 1つの `it` は `seed -> 複数 mutation/query -> assert` まで一気通貫で検証する。
- 細かい validation 分岐や境界値は Function Test / Logic UT に任せる。

例:

```ts
describe("シフト作成シナリオ", () => {
  it("募集作成から希望提出、確定まで完了できる", async () => {});
  it("下書き保存時点の提出済み状態を保持できる", async () => {});
  it("未提出スタッフがいる状態を正しく返す", async () => {});
  it("再提出すると古い希望が残らず最新状態になる", async () => {});
  it("削除済みスタッフは集計・表示対象から外れる", async () => {});
});
```

### 最初に作るシナリオ

最初の Scenario Test は `convex/_scenario/shiftCreation.test.ts` とする。

優先する派生:

1. 募集作成から希望提出、確定まで完了できる。
2. 下書き保存時点の提出済み状態を保持できる。
3. 未提出スタッフがいる状態を正しく返す。
4. 再提出すると古い希望が残らず最新状態になる。
5. 削除済みスタッフは集計・表示対象から外れる。

## 網羅性の考え方

100% 網羅は狙わず、リスクベースで厚くする。

### Logic UT

- 境界値を細かく見る。
- 日付・時刻・タイムゾーンずれ・丸め・ソートは厚めに書く。
- React / Convex に依存しないコードを優先して切り出し、ここで検証する。

### UI Component Test / VRT

- UI の代表状態を Storybook に置く。
- 小さいコンポーネントは Variants Story にまとめ、VRT キャプチャ数を抑える。
- 操作が重要な小さいコンポーネントは Interactive Story を分ける。
- DB や業務フロー全体は検証しない。

### Convex Function Test

以下を優先して細かく見る。

- 未認証
- 権限不足
- 他店舗データ参照(IDOR)
- 論理削除済みデータの除外
- 空データ
- query の返り値に不要フィールドが含まれないこと
- mutation 後の DB 副作用
- Magic Link の期限切れ・使用済みトークン

### Convex Scenario Test

1ユースケースにつき、代表シナリオ1本と壊れやすい派生1〜2本を目安にする。複雑な機能はそれ以上増やしてよいが、全組み合わせ網羅はしない。Convex IT 相当の層なので、正常系だけで終わらせず、未提出、再提出、論理削除、他店舗データ混入、期限切れ、既存データ互換など、業務上重要なエッジケースもここで扱う。

優先度:

1. 売上・運用に直結する主導線
2. 複数テーブルをまたぐ処理
3. 集計・スナップショット・論理削除が絡む処理
4. E2E で検証すると遅すぎる処理
5. 過去に壊れた、または変更頻度が高い処理

### E2E

- 主要なハッピーパスだけに絞る。
- ユーザーが画面から完了できること、実 frontend と実 Convex backend がつながっていることを確認する。
- mutation 成功は、ユーザーに見えるトーストや表示状態で判定する。
- DB の細かい最終状態確認は Convex Scenario Test に寄せる。

## 判断基準

迷ったら次の基準で置き場所を決める。

- 純粋関数だけで検証できる: Logic UT
- UI の見た目や単体操作を確認したい: UI Component Test / VRT
- query/mutation 単体の契約を確認したい: Convex Function Test
- 複数の Convex 関数をまたいだ業務状態遷移を確認したい: Convex Scenario Test
- 実ブラウザ・認証・実 Convex backend との接続を確認したい: E2E

## 実行

変更範囲に応じて、以下を組み合わせて実行する。

```bash
pnpm lint
pnpm type-check
pnpm test:logic
pnpm test:ui
pnpm test:convex
pnpm e2e
```

Convex Scenario Test を追加・変更した場合は `pnpm test:convex` を実行する。

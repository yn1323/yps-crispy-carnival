---
description: "あなたの完全分身として、実用主義に基づいた高品質リファクタリングを実行"
---

# 🔄 リファクタリング実行（あなたの完全分身モード）

対象: $ARGUMENTS

## 🎯 リファクタリングの哲学

**「今の挙動そのまま」でコードをきれいにする。機能的には一切変えずに、コードの見た目や構造だけを改善する。**

- ❌ バグは直さない
- ✅ 副次的な効果でパフォーマンスが上がることはある
- 🎯 **文脈を考慮した実用的な判断**を最優先
- 💪 **迷ったらやる！**の精神

## 🧠 判断基準（あなたの思考プロセス）

### 共通化の判断
**「ときと場合による」を基準に文脈重視で決める：**

✅ **積極的に共通化するもの：**
- ほぼ同じコンポーネント（UserProfile vs UserCard のような重複）
- 頻繁に使う処理（fetch、API呼び出し等）→ 超汎用化して外だし
- バリデーション等の純粋関数 → **テストしやすさ重視**で別ファイルに外だし
- UI部品（input、button等）→ 汎用コンポーネント化

❌ **共通化しないもの：**
- ドメイン固有の部分（責務が違うから）
- form全体（それぞれの責務が明確に違う）
- 1つのファイル内の関数（ファイル内での重複は許容）
- 無理な定数化（文脈上自然でないもの）

🎯 **柔軟対応：**
- ロジック、HTML、CSSの共通化は積極的に
- 同じファイル内のコンポーネントと関数の共存はOK

### 重複コード管理の明確基準
- **2回目の重複** → 警告・検討
- **3回目の重複** → **必ず共通化**

### 関数分割の判断
**Step Down Rule（段階的抽象化）を重視：**

- **「全体を見たい」と「詳細を見たい」が混在している** → 分割対象
- 上から下に「だんだん詳細になっていく」構造にする
- public関数（高レベル・抽象的）→ private関数（詳細・具体的）
- **テストしやすい形に分割**（特にMSW利用時のC/Pパターン）

## 📝 ネーミング改善（一貫性最優先）

### 基本ルール
- **具体的な名前**：`data` → `userData`
- **省略形禁止**：`btn` → `button`、`isAuth` → `isUserAuthenticated`
- **動詞vs名詞**：関数は動詞始まり、変数・定数は名詞
- **複数形統一**：基本`-s`、難しいときのみ`-List`
- **ドメイン用語は絶対統一**：プロジェクト内で同じ概念は同じ名前

### Boolean命名
- **基本**：`is〜`
- **所有・存在**：`has〜`（hasPermission、hasChildren）
- **能力**：`can〜`（canEdit、canDelete）
- **義務**：`should〜`（shouldValidate）
- **否定**：`isDisabled`（`isNot〜`は避ける）

## 🏗️ 技術的指針

### 優先する構造
- **関数ベース** > class（classは避ける）
- **テスタビリティ**を常に考慮
- **関心の分離**だけど過度なモジュール化は避ける
- **エラーハンドリング**：汎用的な部分は共通化、具体的な扱いはドメインロジック側

### コメント・ドキュメント方針
- **「コードで語る」**を基本とする
- 既存コメントは見直し、不要なものは削除
- Step Down Ruleに従い、関数名で意図を表現
- 自明でない複雑なロジックにのみ最小限のコメント
- ドメイン知識が必要な部分は適切にドキュメント化

## 🚫 厳格な禁止事項（絶対遵守）

### React・TypeScript禁止パターン
```typescript
// ❌ 絶対禁止: Function Declaration
function handleSubmit() {}

// ✅ 必須: Arrow Function
const handleSubmit = () => {}

// ❌ 絶対禁止: interface
interface UserProps {}

// ✅ 必須: type
type UserProps = {}

// ❌ 絶対禁止: React.FC
const Button: React.FC = () => {}

// ✅ 必須: 通常関数コンポーネント
const Button = () => {}

// ❌ 絶対禁止: Context API
const Context = createContext()

// ✅ 必須: Props Drilling容認
<Child userProp={user} />

// ❌ 絶対禁止: Enum
enum Status { ACTIVE = 'active' }

// ✅ 必須: Union Types
type Status = 'active' | 'inactive'
```

### 副作用最小化
- **useEffect最小限**（バグの原因になりやすい）
- **Context API禁止**（Props Drilling容認）
- **HOC/Render Props禁止**（Custom Hooks推奨）

### 引数設計の厳格ルール
```typescript
// ✅ 2個以上は必ずオブジェクト化
const createDraft = (name: string, options: {
  maxPlayers: number;
  timeLimit: number;
  isPrivate: boolean;
}) => {}

// ❌ 禁止: 個別引数の羅列
const createDraft = (name: string, maxPlayers: number, timeLimit: number) => {}
```

### 非同期処理の厳格ルール
```typescript
// ✅ async/await必須
const fetchData = async () => {
  try {
    const result = await api.getData();
    return result;
  } catch (error) {
    throw error;
  }
};

// ❌ 絶対禁止: Promise.then()
const fetchData = () => {
  return api.getData().then(data => data); // 使用禁止
};

// ✅ 並列実行はPromise.all必須
const [users, drafts] = await Promise.all([
  fetchUsers(),
  fetchDrafts()
]);
```

### 変数・定数の厳格ルール
```typescript
// ✅ const優先（強制）
const userName = "太郎";
const userList = ["太郎", "花子"];

// ✅ 分割代入積極活用
const { name, age, email } = user;
const [first, second, ...rest] = items;

// ✅ 説明的命名（短縮禁止）
const isUserAuthenticated = true;  // ✅ 分かりやすい
const isAuth = true;               // ❌ 短縮形禁止
```

## 📁 コロケーション戦略（Locality of Behavior）

### ファイル配置の哲学
```
components/feature/gacha/GachaForm/
├── index.tsx              # メインコンポーネント
├── action.ts              # サーバーアクション
├── index.stories.tsx      # Storybook
└── hooks.ts              # ローカルカスタムフック（必要時）
```

**原則：関連するものは物理的に近くに配置**
- 変更時の影響範囲が明確
- 新しい人でも迷わない構造
- **なるべくsrc/*/まで持ち上げず、コロケーションに閉じ込める**

### Barrel Export禁止
```typescript
// ❌ 避ける
import { MailInput, PasswordInput } from '@/components/form'

// ✅ 推奨: Explicit Import
import { MailInput } from '@/components/form/MailInput'
import { PasswordInput } from '@/components/form/PasswordInput'
```

**理由：依存関係の明確化、Tree-shaking効率化、バンドルサイズ最適化**

## ⚛️ React実装パターン（厳格ルール）

### Early Return必須パターン
```typescript
// ✅ 必ずEarly Returnを使用
const processData = (data: Data | null) => {
  if (!data) return null;
  if (data.isEmpty()) return <EmptyState />;
  if (data.hasError()) return <ErrorState />;
  
  // メイン処理
  return <MainContent data={data} />;
};

// ❌ 禁止: ネスト構造
const processData = (data: Data | null) => {
  if (data) {
    if (!data.isEmpty()) {
      // 深いネスト禁止
    }
  }
};
```

### 条件付きレンダリング
```typescript
// ✅ &&演算子使用
{isLoading && <Spinner />}
{error && <ErrorMessage error={error} />}
{data && <DataDisplay data={data} />}

// ✅ 複雑な条件はif文
const renderContent = () => {
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  if (!data) return <EmptyState />;
  return <DataContent data={data} />;
};
```

### Hooks使用方針
```typescript
// ✅ useState基本、useReducer最小限
const [count, setCount] = useState(0);

// ✅ useEffect最小限（バグの原因）
useEffect(() => {
  // 本当に必要な場合のみ
}, []);

// ✅ カスタムフック分離基準
const useDraftLogic = () => {
  // テストしやすさを重視
  // モック化が必要な場合
};
```

## 🧪 テスト戦略（最小限で最大効果）

### テスト方針
- **Storybookはパターン最小限、VRTでカバー**
- **Interaction Test あまり書かない**
- **基本的には"Basic"のみ**
- **data-testid なるべく利用しない**（セマンティック要素優先）

```typescript
// ✅ セマンティック要素重視
role="textbox"
role="button"

// ❌ data-testid は最後の手段
data-testid="email"  // 本当に必要な時のみ
```

### テスト実装パターン
```typescript
// ✅ 日本語命名必須
describe('GachaForm', () => {
  test('ガチャボタンをクリックできる', () => {
    // テスト実装
  });
});

// ✅ VRT重視のStorybook
export const Basic: StoryObj<typeof meta> = {}
// 複雑なパターンは避ける
```

## 🎯 品質・効率バランス戦略

### CI/CD設計思想
- **段階的品質チェック**（push → ready → merge）
- **renovate除外**で自動更新時の無駄実行回避
- **draft PR除外**で不要なリソース消費防止

### 定数化の実用的判断
```typescript
// ✅ 型安全性に直結するもの → 必ず共通化
export const commonSchemas = z.object({...})

// ✅ 本当に汎用的なもののみ → helpers化
export const sleep = (ms: number) => new Promise(...)

// ❌ 無理な定数化は避ける
// 文脈上自然でないものは各ドメインに残す
```

### TypeScript実用戦略
```typescript
// ✅ スキーマから型を自動生成
export type SchemaType = z.infer<typeof Schema>

// ✅ 手動型定義は最小限
type SearchQueryParams = {
  ids: string
  term: string
  noStore?: string  // デバッグ用オプション
}

// ✅ 唯一のany許可ケース
// biome-ignore lint/suspicious/noExplicitAny: ライブラリ型不明のため
const libraryResult: any = externalLib.process()
```

## 🔧 エラーハンドリング実用戦略

### 条件分岐による制御
```typescript
// ✅ 条件分岐で制御（推奨）
const historyPost = params.noStore
  ? () => {}  // デバッグ時は何もしない
  : serverFetch<PostGachaHistory>(...);  // 本番では実行

// ✅ 実用的なエラーハンドリング
const processRequest = async (request: Request) => {
  if (!request.isValid()) {
    return { error: 'Invalid request' };
  }
  
  try {
    const result = await api.process(request);
    return { data: result };
  } catch (error) {
    return { error: error.message };
  }
};
```

## 🎨 UI/UX実装統一ルール

### アニメーション統一
```typescript
// ✅ 150ms + easeOut統一
transition={{ duration: 0.15, ease: "easeOut" }}
```

### レスポンシブ設計
```typescript
// ✅ 2段階ブレイクポイント（PC/SP）
<Text fontSize={["sm", "md"]}>  {/* SP: sm, PC: md */}
```

## やること（Claude Code最適化）
- ✅ Arrow Function（必須）
- ✅ type定義（interface禁止）
- ✅ const使用（let最小限）
- ✅ 分割代入（積極活用）
- ✅ async/await（Promise.then禁止）
- ✅ Early Return（必須）
- ✅ 日本語テスト（必須）
- ✅ Props Drilling（Context禁止）

## やらないこと（厳格禁止）
- ❌ Function Declaration
- ❌ interface使用
- ❌ React.FC使用
- ❌ HOC/Render Props
- ❌ Context API
- ❌ Enum使用
- ❌ 過度な最適化
- ❌ any使用（ライブラリ除く）

## 🚀 実行スタイル

### コミュニケーション
- **理由付きで積極的に提案**（「〜だから〜しましょう」）
- **段階的に確認**しながら進める
- **時間がかかる作業は事前に報告**
- 迷ったときは選択肢を提示（「A案とB案どちらがいいですか？」）

### 作業の進め方
1. **現状分析**：対象コードの構造と問題点を特定
2. **優先順位付け**：最も効果的な改善から順番に
3. **段階的実行**：一度にすべてではなく、確認しながら
4. **テスト重視**：リファクタ前後で挙動が変わらないことを確認

### 最終判断基準
**「迷ったらやる！」**
- 共通化で迷ったら → やっておく
- 抽象化で迷ったら → やっておく
- 分割で迷ったら → やっておく
- テスト追加で迷ったら → やっておく

**理由：後戻りより前進、リファクタは改善行為、やりすぎは後で直せる**

## 🎯 今すぐ開始

対象コード（$ARGUMENTS）を分析して、あなたの完全な思考プロセスに従って段階的にリファクタリングを実行します。

**最初に現状分析を行い、改善点を優先順位付けして提案します。理由と共に説明するので、一つずつ確認しながら進めましょう！**

**Claude Code協働最適化された実用主義で、一貫性のある高品質なコードを作り上げます。**


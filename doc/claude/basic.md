
### コンポーネント設計原則

**Feature-First + コロケーション**パターン：

```
src/components/DraftRoom/
├── index.tsx           # メインコンポーネント
├── index.stories.tsx   # Storybookファイル（パターン作成、簡単なテスト）
└── hooks.ts           # ローカルカスタムフック（必要時）
```

**厳格ルール:**
- ❌ HOC/Render Props使用禁止
- ❌ Context API使用禁止（Props Drilling基本）
- ❌ interface使用禁止（typeのみ）
- ✅ Custom Hooks基本
- ✅ 特化優先 → リファクタで汎用化

## 💻 コーディングルール

### 関数定義（厳格）
```tsx
// ✅ Arrow Function一択
const handleSubmit = async (data: FormData) => {
  // 処理
};

// ❌ 絶対禁止: Function Declaration
function handleSubmit() { /* 禁止 */ }
```

### コンポーネント定義（厳格）
```tsx
// ✅ 通常の関数コンポーネント + type
type DraftRoomProps = {
  draft: DraftType;
  onUpdate: (draft: DraftType) => void;
};

const DraftRoom = ({ draft }: DraftRoomProps) => {
  return <div>{draft.name}</div>;
};

// ❌ 禁止: React.FC + interface
const DraftRoom: React.FC<Props> = () => {}; // 禁止
interface Props {} // 禁止
```

### 引数・制御フロー
```tsx
// ✅ 2個以上は必ずオブジェクト化
const createDraft = (name: string, options: {
  maxPlayers: number;
  timeLimit: number;
}) => {};

// ✅ Early Return必須
const processData = (data: Data | null) => {
  if (!data) return null;
  if (data.isEmpty()) return <EmptyState />;
  // メイン処理
  return <MainContent data={data} />;
};
```

### TypeScript（厳格）
```tsx
// ✅ type一択、Union Types使用
type StatusType = 'waiting' | 'playing' | 'finished';

// ❌ 禁止パターン
interface Status {} // interface禁止
enum Status {} // enum禁止
```

## 🧪 テスト戦略

### 実行方針
- **E2Eテスト**: 毎PR、ハッピーパスのみ、Chrome only
- **単体テスト**: 日本語命名、比重5:1（ハッピー:エッジ）
- **Storybook**: 全コンポーネント必須、代表パターンのみ

### テスト実装例
```tsx
// ✅ 日本語命名必須
describe('useDraftRoom', () => {
  test('ドラフトルームデータを正常に取得できる', () => {
    const { result } = renderHook(() => useDraftRoom('draft123'));
    expect(result.current.draft).toBeDefined();
  });
});
```

## 🎨 UI/UX実装

### Chakra UI使用ルール
```tsx
// ✅ inline style props必須
<Box 
  bg="blue.500" 
  p={4} 
  _hover={{ bg: "blue.600" }}
>

// ✅ レスポンシブ：配列記法、2段階（PC/SP）
<Text fontSize={["sm", "md"]}>
```

### アニメーション統一
- **Duration**: 150ms統一
- **Easing**: ease統一  
- **ローディング**: スピナー使用
- **実装**: Framer Motion使用

## 🗃️ 状態管理戦略

### 階層別管理
```tsx
// Level 1: コンポーネント内（優先）
const [localState, setLocalState] = useState();

// Level 2: Custom Hook（共通ロジック）
const { data, error } = useDraftData(draftId);

// Level 3: Jotai（画面遷移で必要）
const [globalUser] = useAtom(userAtom);

// ❌ 禁止: Context API
```

### Firebase連携
- **更新方式**: 全てリアルタイム更新
- **永続化**: Firebase > SessionStorage
- **アプローチ**: 悲観的更新基本

## 📋 重要なルール

### やること（必須）
- ✅ Arrow Function
- ✅ type定義（interface禁止）
- ✅ const優先（let最小限）
- ✅ 分割代入積極活用
- ✅ async/await（Promise.then禁止）
- ✅ Early Return
- ✅ 日本語テスト
- ✅ Props Drilling

### やらないこと（厳格禁止）
- ❌ Function Declaration
- ❌ interface
- ❌ React.FC
- ❌ HOC/Render Props
- ❌ Context API
- ❌ Enum
- ❌ 過度な最適化

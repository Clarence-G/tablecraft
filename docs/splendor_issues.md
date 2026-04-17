# Splendor 开发过程问题清单

记录实现 `games/splendor` 过程中遇到的摩擦点，供改进文档与脚手架使用。

## 一、脚手架 / 注册流程（docs 与现状有偏差）

### 1.1 i18n 文件 **不是** 自动发现

- **现状：** `packages/client/src/i18n/index.ts` 手写了 11 个游戏的 import + resources 映射
- **DEVELOPMENT.md 与 CLAUDE.md 的表述：** "Client registry uses import.meta.glob, picks up new games with zero edits"、"auto-discovered on both client and server"。这让人误以为所有客户端资源都自动挂接
- **实际：** 新增游戏必须编辑 `i18n/index.ts`，否则大厅卡片显示 "name / description" 字面量（见本次截图）
- **建议：**
  - 用 `import.meta.glob('../../../../games/*/i18n/*.json')` 替换手写 import
  - 或在 `gen:registry` 脚本中一并生成 `i18n/index.ts`

### 1.2 Game icon 需要手动放文件

- **现状：** `<img src={\`/game-icons/${name}.svg\`} />` 指向 `packages/client/public/game-icons/<icon>.svg`
- **DEVELOPMENT.md 的 GameMeta 文档：** `icon?: string; // Lucide icon name, e.g. 'Target', 'Heart'`（注释说是 Lucide 名，实际是 SVG 文件名）
- **实际：** 既不是 Lucide 名（否则无需本地 SVG），也没说明需要手动放 SVG
- **建议：**
  - 文档更新：明确说明 icon 是 `packages/client/public/game-icons/` 下的 SVG 文件名，并指向 `skills/game-icons` 下载流程
  - 或提供 fallback：找不到 SVG 时回退到 Lucide 同名图标

### 1.3 `_template/package.json` 缺依赖

- **现状：** 模板只有 `@repo/shared` + `@repo/game-ui`
- **问题：** 大部分 Board.tsx 要用 `lucide-react`（与 `@repo/game-ui/feedback` 里的 `GameOverModal` 保持视觉一致），但模板没有。`pnpm typecheck` 才会报
  ```
  Cannot find module 'lucide-react'
  ```
- **建议：** 模板直接把 `lucide-react: ^1.8.0` 加进 deps；或改为 peer + 文档点一笔

### 1.4 `_template/package.json` 与 `_template/vitest.config.ts` 的 name 需要手动改

- **现状：** 模板里是 `@games/template` 和 `name: 'template'`
- **实际流程：** 每个新游戏都要手动改两处
- **建议：** `gen:registry` 检测 `games/<id>/` 与 `package.json.name` 不一致时自动同步；或提供 `pnpm scaffold <id>` 脚本

## 二、类型 / Zod schema

### 2.1 `z.enum(readonly T[])` 类型不匹配

- **踩坑：**
  ```ts
  export const TOKENS: readonly Token[] = [...GEMS, 'gold'] as const;
  // 后面 z.enum(TOKENS) 报错：readonly T[] 不兼容 [string, ...string[]]
  ```
- **修复：** 改用字面量数组 `z.enum(['white','blue','green','red','black','gold'])`
- **建议：** 文档加一行避坑：Zod 的 `z.enum` 需要可变 tuple，不能用 `readonly T[]`；可用 `z.enum([...ARR])` 或直接字面量

### 2.2 `PlayerView` schema 未自动暴露

- **现状：** `GET /api/games/:id` 只给 `actionSchema`，PlayerView 的形状要靠 agent 从 `agentRules` 自然语言推断
- **建议（待评估）：** 为 PlayerView 也加一个 `viewSchema`（用 zod + zod-to-json-schema）；或在 `agentRules` 里用 JSON 样例统一规范

## 三、引擎契约

### 3.1 "最后一轮" 没有内置支持

- **Splendor 规则：** 有人先达 15 分后，完成本轮（所有玩家轮完）才结算
- **现状：** 引擎只有一次性的 `END_GAME` 事件。我手动用 `lastRoundStartedBy = firstPlayer` 做标记，等下个 `nextPlayer === firstPlayer` 触发 END_GAME
- **建议：** 如果后续有多款类似游戏（如 Azul、Wingspan），考虑在 `EngineEvent` 加 `BEGIN_LAST_ROUND` 或在游戏内统一抽象

### 3.2 Pending-phase 工具未被使用

- **问题：** 我为了避免引入额外状态机，把 "discard 溢出"、"贵族多选" 都塞进动作 payload，缺省就 reject
- **副作用：** 客户端必须预判并提前把 discard / claimNoble 填好；UX 略生硬
- **DEVELOPMENT.md 的 `pending-phase.ts`：** 存在但我没看懂何时该用、怎么用（只在 section 4 结构里提到）
- **建议：** 补一节 "pending phase 用法"，举一个场景（如 Splendor 溢出丢弃），说明对比 "动作 payload" 的权衡

## 四、Lint / 格式

### 4.1 Biome 部分规则是 error（非配置可见）

- **现状配置（biome.json）：** `noExplicitAny: warn`、`noNonNullAssertion: warn`
- **但：** `lint/a11y/useSemanticElements`、`lint/style/useConst`、`organizeImports`、format 都默认 **error**
- **踩坑：** 我以为 CLAUDE.md 的 "warnings are OK" 意味着所有 lint 都是 warn；实际上部分规则直接会 fail `pnpm lint`
- **建议：** CLAUDE.md 明确列出哪些规则会造成 lint 失败（a11y/semantics、format、useConst、organizeImports）

### 4.2 `biome-ignore` 注释必须紧贴被标记的行

- **踩坑：** JSX 多行元素，`noArrayIndexKey` 报错位在 `key={...}` 那行（第 793 行），注释放在 `<div>` 开始行（第 791/792）无效
- **修复思路：** 改写代码避免 idx；或把注释精确放在 `key=` 行前
- **建议：** DEVELOPMENT.md 的 "Acceptable suppressions" 小节再加一条多行 JSX 的例子

### 4.3 `a11y/useSemanticElements` 对 `role="dialog"` 很严格

- **现状：** 自定义模态用 `<div role="dialog" aria-modal="true">` 会直接 error，biome 建议换 `<dialog>`
- **问题：** `<dialog>` 元素有自己的 `open` 属性/`showModal()` 语义，与受控 React 渲染模式冲突
- **权衡：** 最终加 `biome-ignore` 保留 div + role
- **建议：** 客户端 `components/ui/dialog.tsx` 如果已封好，建议直接用 shadcn 的 Dialog；模板里挂个示例

## 五、测试运行

### 5.1 `pnpm exec vitest run games/splendor/` 不能定向运行

- **踩坑：** 该命令在 workspace 模式下不识别路径过滤，输出 "No test files found"
- **可用命令：** `pnpm --filter @games/splendor test`
- **建议：** DEVELOPMENT.md 的 "Testing Guide" 节同步更新命令（当前写的是 `pnpm exec vitest run games/gomoku/`，实际不生效）

### 5.2 `GameTestHarness` 测试中的 `as any` + `!` 告警

- **现状：** 每个游戏的 `logic.test.ts` 都会触发大量 `noExplicitAny` / `noNonNullAssertion` 警告
- **CLAUDE.md 明确允许：** "acceptable — just leave it as a warning"
- **实际：** 警告数量多到 biome 截断输出，影响排查真实错误
- **建议：** 在 `biome.json` 的 `overrides` 为 `games/*/**.test.ts` 显式关掉这两条规则，消除噪声

## 六、其它 / 细节

### 6.1 `gen:registry` 拒绝 werewolf 没有说明

- **输出：** `[gen-registry] skipping "werewolf" — missing shared.ts`
- **观感：** 以为自己误删了，实际是一个占位目录
- **建议：** 明显的占位符用 `_werewolf` 前缀（与模板同风格）；或在 `gen-registry.ts` 日志里标注是占位

### 6.2 `rules` / `agentRules` / `description` 三者关系不清

- **实际约束：**
  - `description`：大厅卡片的副标题
  - `rules`：人读，规则弹窗
  - `agentRules`：agent 读，动作与 view schema
- **DEVELOPMENT.md 有讲，但位置分散**（section 6.4 和 section "Writing agentRules for New Games"）
- **建议：** 在 "Adding a New Game" 节放一张对照表

### 6.3 完整流程 checklist（实际需要改动的文件）

开发新游戏的实际完整步骤（**带 ⚠️ 是 docs 没覆盖的**）：

1. `cp -r games/_template games/<id>`
2. 改 `package.json` 的 `name` 字段
3. 改 `vitest.config.ts` 的 `name` 字段
4. 写 `shared.ts` / `logic.ts` / `Board.tsx` / `logic.test.ts`
5. ⚠️ 如果 Board.tsx 用 `lucide-react`，把 `lucide-react` 加到 `package.json` deps
6. ⚠️ 创建 `i18n/zh.json` + `i18n/en.json`（至少要有 `name`, `description`, `tags`, `rules`）
7. ⚠️ 编辑 `packages/client/src/i18n/index.ts` 添加 import + resources 映射
8. ⚠️ 放一个 SVG 图标到 `packages/client/public/game-icons/<meta.icon>.svg`
9. `pnpm install`
10. `pnpm gen:registry`
11. `pnpm typecheck && pnpm lint && pnpm --filter @games/<id> test`
12. `pnpm dev` → 浏览器验证

## 七、可快速落地的改进（按投入排序）

| 优先级 | 改动 | 效果 |
|-------|------|------|
| 高 | 模板加 `lucide-react` 到 deps | 避免 typecheck 误报 |
| 高 | `i18n/index.ts` 改 `import.meta.glob` | 消除 i18n 手动注册 |
| 高 | `biome.json` overrides 关闭 test 文件的 any/non-null 警告 | 清爽的 lint 输出 |
| 中 | `gen:registry` 顺带同步 package.json name 和 vitest.config.ts name | 少 2 个手动步骤 |
| 中 | DEVELOPMENT.md 更新测试命令 + 新增 i18n / icon 章节 | 减少文档误导 |
| 中 | icon fallback 到 lucide-react 同名图标 | 无 SVG 也能跑 |
| 低 | 引擎抽象 "last round" | 为未来类似游戏铺路 |
| 低 | PlayerView 自动生成 schema | agent 体验升级 |

## 八、已闭环（跟踪于 [2026-04-17 scaffold spec](superpowers/specs/2026-04-17-new-game-scaffold-design.md)）

- §1.1 i18n 自动发现（`import.meta.glob`）
- §1.2 icon Lucide 回退（单字段，双轨渲染，`GameIcon` 组件）
- §1.3 `_template` 加 `lucide-react` dep
- §1.4 `pnpm new:game <id>` 命令同步 name 等占位符
- §4.1 Biome error vs warn 清单写进 DEVELOPMENT.md §10
- §4.2 多行 JSX `biome-ignore` 示例写进 DEVELOPMENT.md §10
- §4.3 shadcn `Dialog` 建议（进 §7 Board.tsx 一条）
- §5.1 测试命令改为 `pnpm --filter @games/<id> test`
- §5.2 test 文件 `any/!` 通过 `biome.json` overrides 消音
- §6.1 `gen-registry` 日志加了 rename-to-`_` 的 hint
- §6.2 rules / agentRules / description 对照表写进 DEVELOPMENT.md §7
- §6.3 checklist 缩到 3 步（`pnpm new:game` 一把梭）

**未在本次处理（另行立项）：**
- §2.1 `z.enum(readonly)` 坑（补 doc 即可，没合入本次）
- §2.2 PlayerView JSON Schema 自动生成
- §3.1 引擎「最后一轮」抽象
- §3.2 pending-phase 文档


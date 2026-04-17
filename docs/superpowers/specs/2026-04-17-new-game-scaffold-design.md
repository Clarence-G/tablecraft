# New Game Scaffold & Glue Cleanup — Design

**Date:** 2026-04-17
**Status:** Approved, ready for implementation plan
**Context:** Splendor 开发后整理出的 [splendor_issues.md](../../splendor_issues.md) 显示，添加一个新游戏需要 12 步手动操作，其中 4 步是「胶水耦合」（编辑客户端 i18n index、手放 SVG、改 template name 等）。本设计消除这些固定开销。

## Goals

- 新增游戏从 12 步压到 3 步：`pnpm new:game <id>` → 写 `shared.ts` / `logic.ts` / `Board.tsx` / `logic.test.ts` → `pnpm --filter @games/<id> test`
- Agent 不需要感知平台胶水：i18n、icon、registry 都自动接管
- 手动 `cp -r games/_template games/<id>` 这条路径也要受益（不强制 scaffold 命令）
- 文档与实际行为对齐

## Non-Goals

- 引擎契约增强（如「最后一轮」抽象、pending-phase 完善、PlayerView JSON Schema）——另行立项
- 改变 `GameLogic<TState, TAction, TView>` 插件契约
- 改变 Socket / REST API
- 用户交互式 CLI（inquirer 等）——Agent 场景必须非交互

## Architecture Overview

改动 6 个位置，职责互不重叠：

```
scripts/new-game.ts                        ← 新增：pnpm new:game <id>
games/_template/                           ← 更新：lucide-react dep、i18n 骨架
packages/client/src/i18n/index.ts          ← 改写：import.meta.glob 自动发现
packages/client/src/components/GameIcon.tsx  ← 新增：SVG/Lucide 双轨渲染
  （+ packages/client/src/generated/game-icons.ts 自动生成，由 gen-registry 管）
packages/client/src/pages/Lobby.tsx        ← 改：改用新 GameIcon 组件
biome.json                                 ← 加 overrides：test 文件放宽 any/!
scripts/gen-registry.ts                    ← 扩展：日志提示 + 生成 icon 清单
docs/DEVELOPMENT.md + CLAUDE.md + docs/splendor_issues.md  ← 文档对齐
```

不变：`GameLogic` 契约、server 引擎、REST/Socket API、`gen-registry` 对游戏目录的扫描核心逻辑、`clientRegistry` / `serverRegistry` 的结构与接口。

## Components

### 1. `scripts/new-game.ts`（新文件）

**Invocation:** `pnpm new:game <id> [--force]`

**Flow:**
1. 校验 `<id>` 符合 `/^[a-z][a-z0-9-]*$/`（kebab-case，首字符必须字母）
2. 若 `games/<id>/` 已存在：
   - 无 `--force`：报错退出
   - 有 `--force`：`rmSync({ recursive: true })` 后继续
3. `cpSync(games/_template, games/<id>, { recursive, filter })`，`filter` 排除 `node_modules`
4. 占位符替换（三处精确字符串）：
   - `games/<id>/package.json`：`"@games/template"` → `"@games/<id>"`
   - `games/<id>/vitest.config.ts`：`name: 'template'` → `name: '<id>'`
   - `games/<id>/shared.ts`：`id: 'template'` → `id: '<id>'`
   - **不改** `meta.name` / `meta.description`——它们本来就是占位字符串，Agent 写 i18n 时真正决定展示文案
5. 验证 `games/<id>/i18n/` 是否存在（模板自带，来自 step 3 的 cpSync）；如果不存在，补写骨架：
   ```json
   { "name": "", "description": "", "tags": [], "rules": "" }
   ```
6. `execSync('pnpm gen:registry', { stdio: 'inherit' })`——同步 `server-registry.ts` 与 root `package.json @games/*` 依赖
7. 打印下一步提示：
   ```
   Created games/<id>/
   Now:
     1. Edit games/<id>/shared.ts (meta, ActionSchema, PlayerView)
     2. Edit games/<id>/logic.ts (setup, onAction, getPlayerView)
     3. Edit games/<id>/Board.tsx (React UI)
     4. Edit games/<id>/i18n/*.json (display names and rules)
     5. If you added new deps: pnpm install
     6. Test: pnpm --filter @games/<id> test
   ```

**根 `package.json`：** 增加 `"new:game": "tsx scripts/new-game.ts"`。

### 2. `games/_template/` 更新

- `package.json.dependencies` 增加 `"lucide-react": "^1.8.0"`（与 `packages/client`, `packages/game-ui`, `games/splendor` 保持一致）
- 新增 `games/_template/i18n/en.json` + `zh.json`，内容同上
- `shared.ts` 在 `meta` 的 `icon` 字段处加注释：
  ```ts
  // icon: Lucide icon name (e.g. 'Crown') OR SVG filename in public/game-icons/
  // e.g. icon: 'spades' will render /game-icons/spades.svg if it exists,
  // otherwise fall back to the Lucide component named 'spades'.
  icon: '',
  ```

### 3. `packages/client/src/i18n/index.ts` 改写

**现状：** 22 个手写 import + 11 个手写 resources 条目，每加一个游戏都要改两处。

**目标：**
```ts
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import enCommon from './locales/en/common.json';
import enGameUi from './locales/en/game-ui.json';
import zhCommon from './locales/zh/common.json';
import zhGameUi from './locales/zh/game-ui.json';

const gameI18n = import.meta.glob<{ default: Record<string, unknown> }>(
  '../../../../games/*/i18n/*.json',
  { eager: true },
);

const resources: Record<string, Record<string, Record<string, unknown>>> = {
  zh: { common: zhCommon, 'game-ui': zhGameUi },
  en: { common: enCommon, 'game-ui': enGameUi },
};

for (const [path, mod] of Object.entries(gameI18n)) {
  const match = path.match(/\/games\/([^/]+)\/i18n\/([a-z]+)\.json$/);
  if (!match) continue;
  const [, gameId, lang] = match;
  if (gameId.startsWith('_')) continue; // skip _template / placeholders
  resources[lang] ??= {};
  resources[lang][gameId] = mod.default;
}

i18n.use(LanguageDetector).use(initReactI18next).init({
  resources,
  // ...其它配置保持不变
});
```

删除所有手写的 `en<Game>` / `zh<Game>` import。`common` 和 `game-ui` 保留 explicit import（不是 per-game）。

### 4. Icon SVG/Lucide 双轨渲染

**现状：** `packages/client/src/pages/Lobby.tsx:25-27`：
```tsx
function GameIcon({ name, className }) {
  return <img src={`/game-icons/${name}.svg`} alt="" className={className} />;
}
```
找不到 SVG 就是 404 + 空白。

**设计约束：** SVG 放在 `packages/client/public/game-icons/`，Vite 把 `public/` 当成静态目录、**不进 module graph**。所以 `import.meta.glob('/public/...')` 不可用。

**方案：build-time 生成清单**——在 `scripts/gen-registry.ts` 末尾加一步，扫 `packages/client/public/game-icons/*.svg`，写出一个 TS 文件：

```ts
// packages/client/src/generated/game-icons.ts (AUTO-GENERATED)
export const SVG_ICON_NAMES = new Set<string>([
  'gomoku', 'splendor', 'connect-four', /* ... */
]);
```

**新渲染器 `packages/client/src/components/GameIcon.tsx`：**
```tsx
import * as Lucide from 'lucide-react';
import { SVG_ICON_NAMES } from '@/generated/game-icons';

const DefaultIcon = Lucide.Gamepad2; // or similar fallback

export function GameIcon({ name, className }: { name?: string; className?: string }) {
  if (!name) return <DefaultIcon className={className} />;
  if (SVG_ICON_NAMES.has(name)) {
    return <img src={`/game-icons/${name}.svg`} alt="" className={className} />;
  }
  const LucideIcon = (Lucide as unknown as Record<string, Lucide.LucideIcon>)[name];
  if (LucideIcon) return <LucideIcon className={className} />;
  return <DefaultIcon className={className} />;
}
```

**`Lobby.tsx` 修改：** 移除本地 `GameIcon` 定义，改为 `import { GameIcon } from '@/components/GameIcon'`。grep 过目前只有这一处使用。

**Tree-shaking 权衡：** `import * as Lucide from 'lucide-react'` 会把全量图标拉进 bundle。Lucide v1 的 ESM 已支持 per-icon tree-shaking，但 `import *` 会阻止。接受这个代价——等 `pnpm build` 输出大小出现明显回归再切 allowlist。

**添加新 SVG 时：** 用户把 `<icon>.svg` 丢进 `packages/client/public/game-icons/`，再跑 `pnpm gen:registry`——`SVG_ICON_NAMES` 自动更新。Scaffold 命令不帮忙生成 SVG（作画超出自动化范畴）。

### 5. `biome.json` overrides

加一段：
```json
{
  "overrides": [
    {
      "include": ["games/**/*.test.ts", "packages/**/*.test.ts"],
      "linter": {
        "rules": {
          "suspicious": { "noExplicitAny": "off" },
          "style": { "noNonNullAssertion": "off" }
        }
      }
    }
  ]
}
```

不关 `useConst`——测试代码一般不触发，真触发了是 bug。

### 6. `scripts/gen-registry.ts` 扩展

**6.1 日志区分占位目录：** 改动一处 `console.warn`：

```ts
const isPlaceholder = ent.name.startsWith('_');
const missing = !existsSync(sharedFile) ? 'shared.ts' : 'logic.ts';
if (isPlaceholder) {
  console.log(`[gen-registry] skipping placeholder "${ent.name}"`);
} else {
  console.warn(
    `[gen-registry] skipping "${ent.name}" — missing ${missing}\n` +
    `  hint: if this is a placeholder, rename to _${ent.name} to silence`,
  );
}
```

**6.2 生成 SVG icon 清单：** 在脚本末尾新增一步（在 package.json 同步之后）：

```ts
// 扫 packages/client/public/game-icons/*.svg
const iconsDir = resolve(root, 'packages/client/public/game-icons');
const svgNames = readdirSync(iconsDir)
  .filter((f) => f.endsWith('.svg'))
  .map((f) => f.replace(/\.svg$/, ''))
  .sort();

const iconsFile = resolve(root, 'packages/client/src/generated/game-icons.ts');
const iconsContent =
  `// AUTO-GENERATED by scripts/gen-registry.ts. Do not edit manually.\n` +
  `export const SVG_ICON_NAMES = new Set<string>([\n` +
  svgNames.map((n) => `  '${n}',`).join('\n') +
  `\n]);\n`;
writeFileSync(iconsFile, iconsContent);
console.log(`[gen-registry] wrote ${relative(root, iconsFile)} with ${svgNames.length} icons`);
```

（`mkdirSync(dirname(iconsFile), { recursive: true })` 首次运行要建目录。）

### 7. 文档更新

**`docs/DEVELOPMENT.md`**：
- **"Adding a New Game"** 章节重写：
  - 步骤 1：`pnpm new:game <id>`（替代 cp + 改 package.json name + 改 vitest.config.ts name + 建 i18n 目录）
  - 步骤 2：编辑 `shared.ts` / `logic.ts` / `logic.test.ts` / `Board.tsx`
  - 步骤 3：`pnpm --filter @games/<id> test && pnpm typecheck && pnpm dev`
- **icon 字段文档**更新：明确是 SVG 文件名或 Lucide 名，双轨回退规则
- **新增：** Biome 规则清单——哪些是 error（a11y/semantics、format、useConst、organizeImports）、哪些是 warn（noExplicitAny、noNonNullAssertion）
- **新增：** `biome-ignore` 多行 JSX 示例（注释必须紧贴被标记行）
- **新增：** rules / agentRules / description 三者对照表：
  | 字段 | 读者 | 位置 | 长度 |
  |---|---|---|---|
  | description | 人 | 大厅卡片副标题 | 一句话 |
  | rules | 人 | 房间规则弹窗 | 几段 |
  | agentRules | Agent | REST `/api/games/:id` | 策略+视图字段说明 |
- **测试命令修正：** `pnpm exec vitest run games/gomoku/`（不生效）→ `pnpm --filter @games/gomoku test`

**`CLAUDE.md`** §6 "Adding a New Game — Quick Reference"：
- 文件创建表开头改成「先跑 `pnpm new:game <id>`，它会生成下面所有文件；你只需要编辑」
- Workflow 从 5 步缩到 3 步

**`docs/splendor_issues.md`**：在文件末尾加一个「已解决」清单（链接到本 spec），标注哪些 issue 已闭环。

## Testing Strategy

### 单元测试

**`scripts/new-game.test.ts`**（新文件，vitest）：
- 给定一个临时 `<id>`，跑 `new-game.ts` 主函数（export 出来，不走子进程）
- 断言生成的 `games/<id>/`：
  - `package.json` 的 `name` === `@games/<id>`
  - `vitest.config.ts` 包含 `name: '<id>'`
  - `shared.ts` 包含 `id: '<id>'`
  - `i18n/en.json` 和 `zh.json` 存在且是合法 JSON，包含四个骨架键
- 覆盖：非法 id（uppercase、数字开头、含下划线）→ 抛错
- 覆盖：目录已存在、无 `--force` → 抛错；有 `--force` → 覆盖
- Mock `execSync` 避免真跑 gen:registry
- `afterEach` 用 `rmSync` 清掉临时目录

**`packages/client/src/i18n/index.test.ts`**（小型快照测试）：
- 断言 `resources.zh` 包含 `common`, `game-ui`, 和所有当前游戏的 gameId
- 断言 `_template` 的翻译**不**在 resources 里

**`packages/client/src/components/GameIcon.test.tsx`**（React Testing Library）：
- Mock `@/generated/game-icons` 的 `SVG_ICON_NAMES` 为 `new Set(['gomoku'])`
- 传入 `'gomoku'` → 渲染 `<img src="/game-icons/gomoku.svg">`
- 传入 `'Crown'`（Lucide 里有）→ 渲染 Lucide Crown 组件
- 传入 `'nonexistent'` → 渲染 DefaultIcon
- 传入 `undefined` → 渲染 DefaultIcon

**`scripts/gen-registry.test.ts`** 可选扩展（如果目前没有）：断言生成的 `game-icons.ts` 语法正确且包含 `packages/client/public/game-icons/` 下所有 SVG。时间紧可跳过——手动跑一次 `pnpm gen:registry` 后 `cat` 看就行。

### 集成测试 / 手工回归

- `pnpm build` 通过，bundle 里 11 个 game Board chunk 仍然分裂
- `pnpm dev` 启动后大厅 11 个游戏卡片都展示正确的 name/description/tags（i18n 切换也正常）
- 用现有 `splendor` 作为基准：改动后大厅上的 splendor 卡片视觉与当前一致
- 跑 `pnpm new:game __scaffold_test__`，确认 `pnpm --filter @games/__scaffold_test__ test` 直接通过（模板自带的样本测试），然后手动删除

### 不做的测试

- 端到端跑一个完整 Splendor 游戏——这是上个迭代验证过的，本次改动不涉及 runtime
- Biome overrides——配置文件，`pnpm lint` 能过就算过

## Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| `import.meta.glob` 路径 `'../../../../games/*/i18n/*.json'` 对相对路径敏感，若将来 i18n/index.ts 移动位置会失效 | 在注释里写死路径约束；vitest 测试断言 resources 非空 |
| `gen-registry.ts` 在 scaffold 尾部失败（比如 `@repo/shared` 还没 build），`games/<id>/` 已经生成但未注册 | scaffold 捕获 exitCode，失败时只打印「registry sync failed, run `pnpm gen:registry` manually」，**不回滚目录**——已写入的文件是用户/Agent 接下来要编辑的，删掉反而是破坏 |
| Lucide 全量打包导致 bundle 膨胀 | 监测 `pnpm build` 输出大小；超过阈值（如 +100KB gzipped）时切到 allowlist 模式 |
| `pnpm new:game` 在 Windows 上 `cpSync + filter` 行为差异 | 实现时用 Node 内置 `cpSync`，不 shell out；测试里跑在 macOS/Linux CI |
| Agent 用错 icon 名（既不是 Lucide 也不是已有 SVG）时静默失败 | GameIcon 回退到 `DefaultIcon`，不崩；可加 dev-only `console.warn` 提示找不到图标 |
| 添加新 SVG 后忘记跑 `pnpm gen:registry`，`SVG_ICON_NAMES` 没更新 | 文档明确写；后续可加 Vite plugin 监听 `public/game-icons/` 变化自动重跑 |
| `--force` 误删正在开发的游戏 | 文档明确 `--force` 语义；实现时先打印 "Removing existing games/<id>/" 再删除 |

## Rollout

单次 PR 完成，按依赖顺序：
1. 先改 `_template`（加 lucide-react、加 i18n/ 骨架）
2. 扩展 `scripts/gen-registry.ts`（生成 `game-icons.ts`）—— GameIcon 依赖它
3. 新建 `scripts/new-game.ts` + 根 `package.json` script
4. 改写 `packages/client/src/i18n/index.ts`（`pnpm build` 验证 resources 仍一致）
5. 新建 `GameIcon.tsx` 并替换 `Lobby.tsx` 里的本地定义（大厅视觉无回归）
6. 加 `biome.json` overrides
7. 文档更新（DEVELOPMENT.md / CLAUDE.md / splendor_issues.md 尾部闭环清单）

每步跑 `pnpm typecheck && pnpm test && pnpm build` 验证不回归。

## Open Questions

无——所有设计决策已在 brainstorm 环节敲定。

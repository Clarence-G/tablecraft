# ISSUE: Stage 1.5 — PGlite → Postgres 迁移

**Stage**: 1.5（Stage 2 unblock 前的计划外插入）
**Status**: ✅ DONE
**Started**: 2026-05-01 14:xx
**Completed**: 2026-05-01 15:25

## Context

Stage 2（E2E 测试覆盖）撞上 BetterAuth sign-up/sign-in 在浏览器端返回 **HTTP 500** 的真实 app bug。症状：
- `/api/auth/sign-up/email` 500，错误栈指向 drizzle adapter 内部
- 前一次 session 手动试过 drizzle-kit push / pgdata rotate / 清 cookie —— 都没修好
- 同时 pglite 存在的数据目录 rotation 垃圾一路飙升：`packages/server/data/pgdata.crashed.*` 有 96 个目录、共 1.3GB

Hypothesis：pglite WASM（0.2.17）在 Node 24 下有隐蔽 memory corruption / protocol 不兼容，结合 BetterAuth 1.6.6 要求的 drizzle-orm ≥ 0.45（项目原来是 0.36.4）。

## Migration Scope

Runtime + tests 完整迁移到本机 Postgres 17（Homebrew），不做"只试 dev 端"的折衷，一次到位。

### Changes

1. **Dependencies**
   - `drizzle-orm` 0.36.4 → 0.45.2（BetterAuth 1.6 peer dep required）
   - `drizzle-kit` 0.30.3 → 0.31.4
   - `+ postgres@3.4.9`（驱动）
   - `- @electric-sql/pglite@0.2.17`
   - `+ @types/pg@8.15.5`（dev; 历史遗留，可能后续清）

2. **Runtime DB layer** — `packages/server/src/db/index.ts`
   - `new PGlite() + drizzle-orm/pglite` → `postgres(url) + drizzle-orm/postgres-js`
   - 删掉 pgdata rotate / probeAndRotate / isCorruptionError workaround
   - 简化 67 → ~40 行

3. **Drizzle config** — `packages/server/drizzle.config.ts`
   - `driver: 'pglite'` → 默认 pg driver
   - `dbCredentials.url` 从 DATABASE_URL 读

4. **Schema fix** — `packages/server/src/db/schema.ts`
   - `friendships_normalized_check` 加 `COLLATE "C"`
   - **根因**：Postgres 默认 collation `en_US.UTF-8` 是 case-insensitive（`'T' < 'q'` 为 false），与 JS 的 codepoint 比较（`'T' < 'q'` 为 true）**不一致**。JS 端 `normalizePair()` 按 codepoint 排序 `userA < userB`，DB 层 check constraint 按 locale 反而违反。
   - Migration: `0005_fix_friendships_collation.sql`

5. **Test helper** — `packages/server/src/db/testing.ts`（新建）
   - `createTestDb()`: `CREATE DATABASE test_<random>` from `template0` + migrate + return drizzle instance + cleanup fn
   - 为啥不用 schema 隔离：drizzle migration `0002` 里 hardcoded `"public"."user"` FK，schema 隔离绕不过
   - 每 test file 独立 DB（~100ms 创建），并发安全，vitest threads 下 OK

6. **10 test files migrated**
   - 从 `new PGlite() + drizzle + migrate` 改为 `createTestDb()` + `afterEach(cleanup)`
   - `vi.doMock('../db/index.js', () => ({ db }))` pattern 保留（postgres-js 下一样工作）
   - `GameRoom.ledger.test.ts` 加了 polling 等 ledger writes（postgres-js 有真实 TCP 延迟，原 `setImmediate` 不够）

7. **dev/prod config**
   - `.env` / `.env.example` 加 `DATABASE_URL=postgres://...`
   - 需要手动 `createdb tablecraft_dev` + `createdb tablecraft_test`
   - `pnpm --filter @repo/server db:migrate` 应用 migrations

8. **清理**
   - `packages/server/data/` 整个删（1.3GB 垃圾）—— 目录本来就在 `.gitignore`，删本地即可
   - `src/index.ts` 改 error message / 删 rotate 相关注释

## Critical Checkpoint

**BetterAuth sign-up/sign-in 是否修好？**
✅ **是**。`curl -X POST http://localhost:3001/api/auth/sign-up/email` 返回 **HTTP 200** + 完整 user JSON。sign-in 同样 200。根因确认是 pglite + 旧 drizzle 的组合。

## Test Results

| | before | after |
|-|-|-|
| server tests | 0 passing（跑不起来）| 102 / 102 ✅|
| all tests | 537 / 537（stage 1 baseline）| 537 / 537 ✅|
| dev auth | HTTP 500 ❌ | HTTP 200 ✅ |

## Follow-ups（非本 stage scope）

1. **BetterAuth 1.6 callback API drift** — `packages/server/src/lib/auth.ts` 有 TS error（`sendResetPassword` callback 签名 `email` 现在 required 不是 optional）。不影响运行时（JS 向后兼容），server `typecheck` 脚本没 catch 到（server package 不在主 typecheck 流程里）。留到后续 stage 修。
2. **`@types/pg` 依赖** —— 装了但没直接用（postgres-js 自带类型）。可以移除，或者留着以防将来换 `pg`。
3. **`drizzle.config.ts` 的 ts1259 警告** — isolated-file TS noise，全仓 typecheck 绿，忽略。
4. Stage 2 workers 产物（stash@{0}）还在等 unstash：testid 加到 Leaderboard/Lobby/Room、specs 新 dir 内容、worker 2b ISSUE doc 等。等本 stage commit 完后 unstash 继续 Stage 2。

## Decision Log

- **为啥驱动选 postgres-js 不是 pg**：drizzle 官方首推、纯 TS、BetterAuth adapter 兼容、3KB 运行时
- **为啥不用 schema 隔离测试**：drizzle migration 里有 hardcoded `"public"."user"` FK，schema 切换绕不过，只好每 test 独立 DB
- **为啥 `COLLATE "C"` 只加在 check constraint，不加在列**：列级 COLLATE 是 schema-wide 改动，影响 ORDER BY 行为；check constraint 级别 COLLATE 是局部 scope，只影响这一条约束，最小改动原则
- **为啥不做只 dev 端折衷迁移**：时间成本差不多（30-40 min 完整 vs 15 min 部分），但部分迁移留下半 pglite 半 pg 的混乱状态。一次迁完干净。

## Key Files Modified

```
packages/server/src/db/index.ts          (runtime → postgres-js)
packages/server/src/db/testing.ts        (NEW: createTestDb helper)
packages/server/src/db/schema.ts         (COLLATE "C" fix)
packages/server/src/db/db.test.ts
packages/server/src/api/friends.test.ts
packages/server/src/api/points.test.ts
packages/server/src/api/points.ts        (注释更新)
packages/server/src/api/reports.test.ts
packages/server/src/api/token-store.test.ts
packages/server/src/lib/auth.test.ts
packages/server/src/lib/ledger.test.ts
packages/server/src/socket/auth.test.ts
packages/server/src/engine/GameRoom.ledger.test.ts
packages/server/src/index.ts
packages/server/drizzle/0005_fix_friendships_collation.sql  (NEW)
packages/server/drizzle/meta/0005_snapshot.json             (NEW)
packages/server/drizzle.config.ts
packages/server/package.json             (+ db:migrate script)
packages/server/scripts/migrate-dev.ts   (NEW: migration runner)
.env
.env.example
pnpm-lock.yaml
```

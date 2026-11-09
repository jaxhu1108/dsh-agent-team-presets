# DSH 版本适配说明（rc.2 → rc.3）

本文写给两类读者：

- **想把本插件装到自己 DSH 上的使用者** —— 看「我需要做什么」。
- **想让自己的智能体帮你改代码/改插件的开发者** —— 看「适配点清单」，那些是 rc.2 → rc.3 真正变了的地方，照着改就行，不用重新摸索。

适配基线：Runtime `0.2.1-rc.3`，插件本版 `0.2.0`。

---

## 一、我需要做什么（使用者）

只有一件事：**确认你的 DSH 版本对得上**，然后装上。

| 你的 DSH 版本 | 能不能用本版 | 说明 |
|---|---|---|
| `>= 0.2.1-rc.2 < 0.3.0` | ✅ 可以 | 插件声明的最低版本。rc.2 是下限，因为下面第 4 条那个依赖包自己就从 rc.2 起步 |
| `0.2.0-rc.2` | ❌ 不行 | 插件管理器会拒绝安装/激活。要用就必须先升级 DSH |
| `>= 0.3.0` | ❌ 未验证 | 本版没有在 0.3 上跑过，不声明支持 |

查版本：

```sh
dsh --version
```

`0.2.1-rc.2` 与 `0.2.1-rc.3` 的 API 在本插件用到的范围内是一致的，两个版本都能装。

### 别把两件事搞混

- **插件版本**（本版 `0.2.0`）
- **Runtime 版本**（`0.2.1-rc.3`）

两条独立的版本线。插件 `0.2.0` 跑在 Runtime `0.2.1-rc.3` 上是正常组合，不是版本不匹配。

---

## 二、rc.2 → rc.3 到底变了什么（适配点清单）

以下六条是本插件为了在 rc.3 上跑通而实际改动的地方。每条都写了**症状**（不改会怎样）、**旧写法**、**新写法**。给别人改插件用。

### 1. 工具执行从「单次调用」改成「批量调用」

**这是最容易踩的一条**，本插件 132 个老测试全挂在这上面。

**症状**：运行时报 `TypeError: Cannot read properties of undefined (reading 'map')`，栈里指向 `tools/src/batch.ts`；或直接被包成 `ToolBatchExecutionError: Tool batch execution failed`。

**旧写法（rc.2）** —— `execute` 收一个调用，直接返回结果：

```ts
const result = await ctx.tools.execute({
  callId: ToolCallId('my-call'),
  name: 'some_tool',
  arguments: { a: 1 },          // 对象
  agent,
  signal,
})
// result: ToolExecutionResult = { isError, content }
```

**新写法（rc.3）** —— `execute` 收一批，返回一批：

```ts
const batch = await ctx.tools.execute({
  calls: [{
    type: 'tool-call',
    id: ToolCallId('my-call'),
    name: 'some_tool',
    arguments: JSON.stringify({ a: 1 }),   // 原始 JSON 字符串，不是对象
  }],
  agent,
  signal,
})
// batch: ToolBatchResult = { results, additionalContexts, concluded }
// batch.results[i]: ToolCallResult = { callId, result: ToolExecutionResult }
```

三个必须记住的差异：

1. 入参从 `{callId, name, arguments}` 变成 `{calls: [...]}`。
2. `arguments` 是**字符串**，不是对象（rc.3 内部 `JSON.parse`，空字符串按 `{}` 处理）。
3. 结果**深了一层**：`result` → `batch.results[i].result`。而且 `results[i]` 本身还带 `callId`，所以想按 id 对应结果时不用自己记顺序。

放多个调用时，一次塞进 `calls` 数组，按 `results` 顺序取；rc.3 会按每个工具自己的并发类别调度（`parallel` 还是 `serial`），这部分你不需要自己管。

相关源码位置（Runtime checkout 内）：`packages/core/tools/src/executor.ts`（类型定义）、`packages/core/tools/src/batch.ts`（调度实现）。

### 2. `tools.presentAs()` 被 `tools.setExecutor()` 取代

**症状**：调用 `presentAs` 报方法不存在；或者工具策略装上了但没生效。

**旧写法**：
```ts
const dispose = agent.ctx.tools.presentAs('native')
```

**新写法**：
```ts
import { NativeToolExecutor } from '@deepseek-ai/dsh-tool-executor-native'

const dispose = agent.ctx.tools.setExecutor(new NativeToolExecutor(agent.ctx))
```

语义差异（这点很关键，容易写出 bug）：

- rc.3 里**同一个 scope 只接受一个「活着的」executor**。第二个声明会抛错。
- 但 executor 卸载之后，scope 就重新接受新的声明了。
- 所以「先探一下这个 scope 收不收」的正确做法是：声明 → 立刻释放 → 再正式声明。本插件 `src/presentation.ts` 的 `prepareNativePresentation` 就是这么做的，注释里写清了为什么释放就够。

**本插件因此新增了一个 peer 依赖**：`@deepseek-ai/dsh-tool-executor-native >= 0.2.1-rc.2`。这是 `engines.dsh` 下限从 `0.2.0-rc.2` 抬到 `0.2.1-rc.2` 的真正原因——不是随便抬的，是那个包自己的版本范围就这么写。

### 3. 读「这一轮是不是用户发起的」换了 API

**症状**：预设写入工具报 `must be called inside an open model turn`，即使确实在对话里；或者报 `ctx.sessionProjections` 是 undefined。

**旧写法**：
```ts
const boundary = ctx.sessionProjections.stateOf(agent.session, 'turnBoundary')
```

**新写法**：
```ts
const boundary = ctx.agents.turnBoundaryOf(agent.session)
```

连带变化：插件 `inject` 列表里的 `sessionProjections` 可以去掉（本插件已去掉，现在注入的是 `['agents', 'agentTeams', 'tools', 'systemPrompt', 'settings', 'subagents']`）。

返回值形状没变，还是 `{ openTurnStartSeq, ... }`，`null` 表示当前没有打开的轮次。

### 4. 成员模型路由必须走 selection **事件**，不能只装投影

**症状**：成员第一个请求用的模型是对的，但会话恢复、上下文压缩之后模型变了；或者模型选择器显示的和实际跑的不一致。

**旧写法** —— 只装一个投影，覆盖当前值：
```ts
disposers.push(installModelSelection(agent.ctx, {
  current: { provider, model, reasoningEffort },
  assembled: undefined,
}))
```

**新写法** —— 先通过 Agent 记录一条 selection 事件，再装投影；投影只负责重放会话里已经记下的值：
```ts
agent.model.select({ provider, model, reasoningEffort })
disposers.push(installModelSelection(agent.ctx))
```

原因：rc.3 的会话日志是权威来源。只装投影不改事件，replay / compaction / 模型选择器三者就会各说各话。本插件改动在 `src/member-runtime.ts` 的 `installMemberScopes`。

### 5. `Subagents` 服务多要求一个依赖

**症状**：测试里 `ctx.plugin(Subagents)` 之后 `ctx.subagents` 是 `undefined`，报 `Cannot read properties of undefined (reading 'registerProvider')` / `(reading 'list')` / `(reading 'getProvider')`。

rc.3 的 `SubagentRuntime` 声明了 `static inject = ['workingDirectory', 'sessionProjections']`。所以只提供 `workingDirectory` 不够了，还得有 `sessionProjections`（`SessionProjectionRegistry`，来自 `@deepseek-ai/dsh-session-projection`）。

**最省事的修法**：测试里用 `mountAgentLoopTestDependencies(ctx)`，它已经按正确顺序挂好 `LlmRuntime / SessionStore / SessionProjectionRegistry / SystemPrompt / ToolRuntime / NativeToolExecutor / AgentRegistry`。要手搓最小上下文的话，在挂 `Subagents` **之前** `await ctx.plugin(SessionProjectionRegistry)`。

> 注意别被这条误导：插件自己的 `inject` 里去掉了 `sessionProjections`（见第 3 条），但**测试装配**里挂着它——这是两件事。插件不需要读它了，可 `Subagents` 需要它存在。

### 6. 工具执行器必须真的挂上，否则运行时报 "unavailable"

**症状**：`ToolExecutorUnavailableError: The selected tool executor is unavailable. Load an executor in this composition before running the agent.`

这不是代码错，是组合里没挂 `NativeToolExecutor`（或 PTC 那个）。`mountAgentLoopTestDependencies` 默认会挂；手搓上下文的必须自己补。

### 7. 【最容易翻车】`setExecutor()` 的声明释放了，这个 scope 就废了

这条是 rc.3 最隐蔽的一处，**单元级看不出来，只有「插件被卸载过一次」才炸**。

**症状**：同一个 `ToolExecutorUnavailableError`，但组合里明明挂了 executor。

**实测行为**（我写了探针逐条验过）：

| 步骤 | 结果 |
|---|---|
| root 有 executor，正常调用 | ✅ 正常 |
| 在 **agent scope** 调 `setExecutor(...)` | ✅ 正常 |
| 调用它的 disposer 释放 | ❌ 之后每次调用都抛 `ToolExecutorUnavailableError` |
| 在同一 scope **再** `setExecutor(...)` | ✅ 恢复 |

原因：`setExecutor()` 的文档写着 *"Unloading leaves the selection unavailable until it is replaced"* —— 释放**不会回退到父层或 root**，它留下一条 `executor: undefined` 的记录，专门用来防止程序悄悄落到另一个 executor 上。而 `selectExecutor` 沿 scope 链找到这条记录就 `break`，不检查它是不是空的。

**所以**：
- 想让 scope 回到默认，只能**重新声明**，不能靠释放。
- 任何「临时装一下、用完就释放」的 probe 写法都是定时炸弹。
- 插件被卸载（HMR、重新加载、quarantine 重建角色）时如果释放了 agent-scope 声明，**这个会话的所有工具调用全废**，包括它自己的恢复通道。

**正确写法**：声明绑定到**真正拥有它的那个 scope 的生命周期**，而不是申请它的那次调用的生命周期。

```ts
// ✅ 声明随 Agent 存活，插件卸载不影响；同一 Agent 只声明一次
const declarations = new WeakMap<Agent, () => void>()
export function installNativePresentation(agent: Agent): () => void {
  if (declarations.has(agent)) return () => {}
  const release = agent.ctx.tools.setExecutor(new NativeToolExecutor(agent.ctx))
  declarations.set(agent, release)
  agent.ctx.effect(() => () => { declarations.delete(agent); release() }, 'name')
  return () => {}   // 调用方拿到的disposer是空操作
}

// ❌ probe 用完就释放：下一次这个 Agent 的任何调用都会抛 unavailable
const release = agent.ctx.tools.setExecutor(new NativeToolExecutor(agent.ctx))
release()
```

**验证要点**：`agent.ctx.effect()` 注册的清理函数**随 Agent 销毁**，不随插件卸载。我实测过：插件 dispose 后声明仍在、调用正常；Agent dispose 后才真正释放。这是让二者生命周期正确解耦的关键。

本插件因此在 `src/presentation.ts` 用了一张 `WeakMap` 缓存声明，`src/tool-policy.ts` 的 `guardPolicy` 只复用、不再拥有或释放它。

---

## 三、让智能体帮你适配（可直接粘给它）

把下面这段丢给你的智能体，它能照着干活，不用你解释背景：

> 这个 DSH 插件要适配 Runtime `0.2.1-rc.3`。rc.2 到 rc.3 的变化点已记录在仓库 `ADAPTATION.md`，请先读它。
>
> 具体做：
> 1. `grep -rn "tools.execute({" src/ tests/` 找出所有单次调用形状，改成 `{ calls: [{ type:'tool-call', id, name, arguments: JSON.stringify(args) }] }`，结果取 `batch.results[i].result`。
> 2. `grep -rn "presentAs" src/ tests/` ���成 `setExecutor(new NativeToolExecutor(ctx))`；注意同 scope 只能有一个活 executor，探测后要立即释放。
> 3. `grep -rn "sessionProjections.stateOf" src/ tests/` 改成 `ctx.agents.turnBoundaryOf(session)`，并把 `sessionProjections` 从插件 `inject` 里去掉。
> 4. `grep -rn "installModelSelection" src/` 确认是先 `agent.model.select(...)` 再装投影。
> 5. 测试里挂 `Subagents` 之前确认 `workingDirectory` 与 `sessionProjections` 都在，否则用 `mountAgentLoopTestDependencies`。
> 6. `package.json` 的 `engines.dsh` 抬到 `>=0.2.1-rc.2 <0.3.0`，并加 peer `@deepseek-ai/dsh-tool-executor-native`。
>
> 每改一处就单独跑相关测试；不要为了变绿放宽断言。改完跑类型检查、构建、全量测试。

---

## 四、本版新增的功能：队长人事权限（personnelControl）

顺带记录，因为这是 `0.2.0` 相对上游 `0.1.8` 的功能增量。

**用途**：让队长自己管团队成员名单，不必每次都由人去设置页改。

**开关**：每个团队一个 `personnelControl` 布尔值，**默认关闭**。开启本身即授权，队长不再逐次申请审批。

**开着的时候队长能做**（走 `update_team_preset` 工具）：
- 新增成员、改成员名字
- 改成员的描述、系统提示词
- 改成员的 `provider` / `model` / `reasoningEffort`
- 改成员的 `toolMode` / `tools`
- 移除成员

**两条护栏**（都在 `src/preset-editor.ts`）：
1. `toolMode: "custom"` 配空工具列表 → 拒绝。空白名单等于「一个工具都不许」，与打错字无法区分。
2. 切回 `toolMode: "all"` 时清空已存列表。否则日后切回 `custom` 会悄悄复活一个没人重选过的限制。

**一条权限护栏**（`src/preset-tools.ts` 的 `writeAuthorisedByPolicy`）：会话权限等级为「仅可查看」（read-only）时，成员名单写入被拒。因为那不是「不许改预设」，而是「这个会话什么都不改」。

**生效时机**：名单在一次任务边界后生效，不在改它的那一轮内生效。因为名单在工具集注册时就解析完了。

---

## 五、改动清单（本版相对上游 0.1.8）

### Runtime API 迁移

| 文件 | 改动 |
|---|---|
| `src/presentation.ts` | `presentAs('native')` → `setExecutor(new NativeToolExecutor(ctx))`；声明随 **Agent 生命周期**持有，不再释放（见下方「第 7 点」） |
| `src/tool-policy.ts` | 同上，守卫路径；`guardPolicy` 不再拥有/释放该声明 |
| `src/preset-tools.ts` | `sessionProjections.stateOf` → `agents.turnBoundaryOf`；新增 read-only 权限护栏；成员路由整体校验 |
| `src/member-runtime.ts` | 模型路由改为先 `agent.model.select()` 记录事件，再装投影 |
| `src/index.ts` | `inject` 去掉 `sessionProjections` |
| `src/application.ts` | 注释与类型措辞跟进 executor 语义 |
| `package.json` | `engines.dsh` → `>=0.2.1-rc.2`；新增 peer `dsh-tool-executor-native` |
| `tsconfig.host.json` / `tsconfig.client.json` | 补入 12 个此前漏检的源文件（覆盖 36 → 48，全覆盖） |

### 功能增量

| 文件 | 改动 |
|---|---|
| `src/types.ts` | `TeamPreset.personnelControl?: boolean` |
| `src/config.ts` | 配置 schema 增加 `personnelControl`，默认 `false` |
| `src/preset-editor.ts` | 成员增删改全套：`name`/`provider`/`model`/`reasoningEffort`/`toolMode`/`tools`/`remove`，含两条护栏 |
| `src/preset-tools.ts` | `update_team_preset` 暴露上述参数；`get_team_preset` 回报完整成员配置 |
| `src/client/preset-file.ts` | 新增文件格式 v3，携带 `personnelControl`，v1/v2 兼容读取 |
| `src/client/TeamEditorView.tsx` | 设置页新增人事权限开关 |
| `src/client/locales.ts` | 中英文案 |

### 新增测试

| 文件 | 覆盖 |
|---|---|
| `tests/personnel-control.spec.ts` | 16 个用例：开关语义、增删改、两条护栏、read-only 拒绝 |
| `tests/team-editor.client.spec.tsx` | 设置页开关渲染 |
| `tests/preset-tools.spec.ts` | 从 33 增至 37 |

---

## 六、验证状态（诚实版）

本版发布前实测过：

| 项目 | 结果 |
|---|---|
| 类型检查（host） | 0 本地诊断 |
| 类型检查（client） | 0 本地诊断 |
| 构建 | 通过，产物 `lib/index.js` SHA256 `5dc3c1dbf55f96857ea313563caca82cda2a40824b52d9d175bb4eb9627b71d1` |
| 全量测试 | 762 个用例：**761 通过 / 1 跳过 / 0 失败**（51 文件，连跑 3 次一致） |
| 真实运行时加载 | 已在本机 Runtime `0.2.1-rc.3` 上线运行 |

**没有验证到的**：
- Windows 平台。路径分隔符与可执行文件解析有单元测试覆盖，但没有真机跑过完整原生构建链。
- Runtime `0.3.x`。本版不声明支持。

---

## 七、本地开发怎么跑

需要一份**装了依赖**的 Runtime checkout：

```sh
export DSH_CHECKOUT=/绝对路径/deepseek-runtime
npm test          # 单元/组合测试
npm run typecheck # host + client 两面
npm run bundle    # 构建 lib/
```

构建脚本会在临时工作区里镜像 checkout，**绝不写进 Runtime 目录**。

**踩过的坑**：某些测试要在「祖先目录没有 node_modules」的目录里跑（为了证明产物没有裸 `zod` 依赖）。如果 `/tmp` 下有 `node_modules`，`typert-isolation.spec.ts` 会整组跳过并报 `No dependency-isolated scratch directory is available`。绕过：

```sh
TMPDIR=/dev/shm npm test
```

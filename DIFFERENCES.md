# 这个分支和上游有什么不同

上游：[bloodarea/dsh-agent-team-presets](https://github.com/bloodarea/dsh-agent-team-presets)
本分支：[jaxhu1108/dsh-agent-team-presets](https://github.com/jaxhu1108/dsh-agent-team-presets)
包名：`dsh-team-presets`（npm 与 GitHub 双渠道）

---

## 一、先说清楚：这不是「更好的版本」

这个分支**不是上游的升级版**，是**一个独立维护的变体**。

它多做了几件上游没做的事，也少做了几件上游有的事。选择哪个，取决于你要什么——下面把两边摆平，你自己判断。

上游维护得很认真。本分支的 `setExecutor` 生命周期方案已被上游 `v0.2.0` 采纳（独立实现，未合并代码），见 [上游 issue #5](https://github.com/bloodarea/dsh-agent-team-presets/issues/5)。

---

## 二、本分支比上游多什么

### 1. 工具策略体系（核心差异）

上游只有「全部工具」和「自定义白名单」两种 `toolMode`。本分支把它拆成三个模块，共 **476 行**：

| 模块 | 行数 | 作用 |
|---|---|---|
| `src/tool-catalog.ts` | 191 | 工具目录：把宿主工具整理成可浏览、可分类的清单 |
| `src/tool-policy.ts` | 261 | 策略计算：角色、熔断、恢复工具集、guard 判定 |
| `src/tool-descriptions.ts` | 24 | 工具描述注入 |

**实际差别**：配一个「只能读不能写」的侦察兵，或一个「只能跑测试不能改代码」的审查员时——

- 上游：你得在设置页手打工具名，且不知道有哪些可选
- 本分支：设置页列出所有工具，按组浏览，勾选即可

### 2. 团队级成员管理开关（`personnelControl`）

每个团队有一个独立开关，默认 `false`。开启后，**只有队长**能增删成员；关闭时成员的增删被拒绝并给出原因。

用途：把团队冻结成模板分发给别人时，防止对方误改成员结构。

上游没有这个概念。

### 3. npm 发布渠道

| 渠道 | 上游 | 本分支 |
|---|---|---|
| GitHub Releases | ✅ | ✅ |
| npm | ❌ | ✅ `dsh-team-presets` |

**这不是小事。** 插件管理器的更新检测只认可 registry 来源：

```ts
// packages/boot/plugin-manager/src/index.ts — updateRefusal()
if (parsed.kind !== 'registry' || ...) return `${name} is not installed from a registry under its own name`
```

`github:` 会被解析成 `kind: 'git'`，在任何版本查询之前就被拒绝。

- 从上游 GitHub 安装 → **永远不会提示更新**，只能手动重装
- 从本分支 npm 安装 → 管理器自动比对 `latest` 并提示

### 4. 界面圆角统一

上游的样式表混用 12 种硬编码圆角（5~17px），绕开主题的六档梯度。本分支：

- 35 处全部改走 `--dsw-radius-xs/sm/md/lg/xl/panel`
- 4 处全圆元件补 `corner-shape: round`（宿主用 `* { corner-shape: superellipse(1.5) }` 全局施加超椭圆，缺配对会让圆点变南瓜、胶囊两端削平）
- 新增 `tests/corner-radius.client.spec.ts` 两条静态守护

### 5. Typert 远端面隔离测试

`tests/typert-isolation.spec.ts`（17 条）：在**无法解析 zod** 的进程里加载两个 wire face，证明客户端面不依赖 zod。上游没有这层保护。

---

## 三、上游有而本分支原来没有的

### 已补齐：内置排障 Skill

上游 `src/builtin-skill.ts`（252 行）注册一个全局 runtime skill，用户遇到「团队不生效 / 成员召唤不了 / 工具被拒 / 模型路由不符」时能自助排查，含 12 个章节、证据优先级表、诊断命令和报告模板。

**本分支已纳入**（`v0.2.4`），并做了两处适配：

- 包名与路径指向 `dsh-team-presets`
- 内容按本分支的实际实现校准

### 仍未纳入：客户端按成员选模型

上游客户端有一套「按成员维度选择 provider/model」的界面。本分支没有。

为什么不追：本分支的 `personnelControl` 是「按团队管成员」，上游的 `selectMember` 是「按成员选模型」——两个方向不同，硬追会变成两套机制互相打架。**本分支的模型路由在团队预设里配置，不依赖会话内选择。**

---

## 四、两者一致的实现

`setExecutor` 的 Agent 生命周期绑定。两边**独立实现，结论相同**：

```ts
agent.ctx.tools.setExecutor(new NativeToolExecutor(agent.ctx))
```

- 注册挂在 Agent 自己的作用域上，disposer 永不调用
- Agent 销毁时随上下文回收
- 因此不会触发 rc.1 的单向释放（tombstone）

本分支的 `src/presentation.ts` 与上游 `v0.2.0` 在这一点的行为一致。上游明确说明「未合并下游代码」。

---

## 五、怎么选

| 你的情况 | 建议 |
|---|---|
| 需要精细控制成员能调哪些工具 | **本分支** |
| 需要把团队冻结成模板分发 | **本分支** |
| 希望插件能自动提示更新 | **本分支**（npm 渠道） |
| 需要会话内按成员切模型 | **上游** |
| 想紧跟最活跃的开发 | **上游** |
| 只是用内置的 9 套预设，不改工具策略 | 两边都行，上游更轻 |

**换分支的迁移成本**：设置与 Team Skill 存在 `$DSH_HOME/agent-team-presets/` 下，按**插件内部名**而非包名。两边的内部名相同，所以数据不丢。但两个包不能同时安装（同一个插件内部名会冲突），切换时先卸载再装。

---

## 六、维护承诺与其边界

本分支**独立维护**，不承诺跟随上游的每个版本。具体说：

- 上游修复了会影响本分支的安全或正确性问题 → 跟进
- 上游新增功能，与本分支无冲突 → 评估后纳入
- 上游新增功能，与本分支机制冲突 → 不纳入，在本文档记录原因

**上游是主线，本分支是侧支。** 如果你只需要上游的全部能力，用上游没有错。

---

## 七、当前版本对照

| | 上游 | 本分支 |
|---|---|---|
| 最新版本 | `v0.2.0` | `v0.2.4` |
| `engines.dsh` | `>=0.2.2-rc.1 <0.3.0` | `>=0.2.2-rc.1 <0.3.0` |
| 安装包名 | `dsh-agent-team-presets` | `dsh-team-presets` |
| npm | 无 | [有](https://www.npmjs.com/package/dsh-team-presets) |
| 测试用例 | — | 772（771 通过 / 1 跳过） |

版本号不对齐是**故意的**：两个独立包，各自演进，不需要用版本号暗示兼容关系。

---

*最后更新：2026-11-12 · 对应本分支 `v0.2.4`*

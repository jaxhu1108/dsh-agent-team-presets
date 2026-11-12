# dsh-team-presets

<img src="banner_zh.png" alt="为 DeepSeek Runtime 配置可复用的智能体团队预设" width="100%">

*横幅为概念示意，实际界面见[界面预览](#screenshots)。队长使用当前会话选择的模型。*

中文 | [English](<README.en.md>)

> **版本 v0.2.4** · 适配 DeepSeek Runtime `0.2.2-rc.1` 及以后的 0.2.x
>
> 这是一个 **DSH 插件**：给你的 DeepSeek Runtime 加一个可视化的「智能体团队预设」管理器。配好一套团队，从输入区一键选用，队长就能带着队员干活。
>
> **本插件由原作者 [bloodarea](https://github.com/bloodarea/dsh-agent-team-presets) 的创意与架构启发**：团队预设的数据模型、9 套内置预设、私有 Team Skill 子系统与整体插件骨架均源自上游项目。本仓库是在其基础上跟进新版 Runtime 的适配分支，不是独立创作。完整归属说明见 [CREDITS.md](<CREDITS.md>)。
>
> **仓库已包含预构建产物**，安装不需要编译源码。

> **本分支与上游不同，请先看对照**：这个仓库是**独立维护的变体**，不是上游的升级版。多做了工具策略体系、团队级成员管理开关、npm 发布渠道与圆角统一；上游有而这里没有的是「会话内按成员切模型」。
>
> 两者摆平对照，自己判断用哪个 → **[DIFFERENCES.md](<DIFFERENCES.md>)**（[English](<DIFFERENCES.en.md>)）
>
> **界面**：设置页与输入区圆角已统一到主题 token（`--dsw-radius-*`），4 处全圆元件补齐 `corner-shape: round`。

---

## 这个插件解决什么问题

DeepSeek Runtime 原生就有 Agent Teams（队长 + 队员 + 共享任务板 + 消息协作）。但在它自带的版本里，**"用哪套团队、每个角色是什么设定"这件事全靠你每次现场描述**。

本插件补上这一层：

| 你的痛点 | 本插件怎么解决 |
|---|---|
| 每次都要重新描述一遍角色分工 | 团队存成具名预设，一键选用，反复复用 |
| 一个团队里想按任务用不同模型 | 每个成员独立配 provider / 模型 / 思考强度，队长仍用你当前会话的模型 |
| 某个角色权限太大或太小 | 队长和每个成员各带独立的工具白名单 |
| 技能一注册就全局可见，谁都看得到 | 私有 Team Skill 库，技能**只在被分配的那个角色**的作用域里注册 |
| 想改个队员设定要跑去设置页 | 打开「队长人事权限」，让队长自己增删改队员（v0.2.0 新增） |

**核心分工**：原生 Agent Teams 管运行时协作；本插件管团队和技能的配置、隔离、复用。

---

## 环境要求

装之前先确认这三条，缺一条都装不上或跑不起来。

### 1. DSH 版本

| 你的 DSH 版本 | 能否使用 |
|---|---|
| `>= 0.2.2-rc.1 < 0.3.0` | ✅ **支持**。`0.2.2-rc.1` 实测可用（模块加载、版本校验、依赖解析全部通过） |
| `0.2.1-rc.x`（含 rc.2、rc.3） | ❌ **不支持**。见下方说明 |
| `0.2.0-rc.2` 及更早 | ❌ **不支持**。插件管理器会直接拒绝安装/激活 |
| `>= 0.3.0` | ❌ **未验证**，本版不声明支持 |

查版本：

```sh
dsh --version
```

> **为什么下限是 `0.2.2-rc.1`？** 本版依赖 `@deepseek-ai/dsh-tool-executor-native`，而这个包在 npm 上**只从 `0.2.2-alpha.2` 才开始存在**。0.2.1-rc.x 时期它还不是独立包（native 执行器内建在 Runtime 里）。
>
> v0.2.0 曾经错误地把 peer 范围写成 `>=0.2.1-rc.2`，指向一个不存在的版本；结果 npm 为了凑这个区间去拉 `0.2.2-alpha.2`，而它要求 `cordis ~4.0.6-alpha.1`，和 0.2.1-rc.x 的 `4.0.5` 冲突，导致安装直接失败。v0.2.1 修正了这一点。

### 2. Agent Teams 已启用

标准集成是 `@deepseek-ai/dsh-experimental-agent-team-profile`，它提供团队服务、工具和 Web 名册。**本插件只配置和管理团队，不替代这个子系统。**

### 3. Web 或 Desktop profile

插件界面要挂在 Settings 里，所以要装到你**实际在用的那个 profile**：Web GUI 一般是 `web`，桌面端一般是 `desktop`。

> 另外，成员创建需要持久存储和支持恢复执行的子智能体后端（默认 `spawn`、`fork`）。这两个不可用时插件会**明确拒绝**创建成员，而不是偷偷降级。

### 版本号别搞混

- **插件版本**：本版 `0.2.4`
- **Runtime 版本**：例如 `0.2.2-rc.1`

两条完全独立的版本线。插件 `0.2.4` 跑在 Runtime `0.2.2-rc.1` 上是**正常组合**，不是版本不匹配。

---

## 安装

### 方式一：从 npm 安装（推荐，能收到更新提示）

```sh
dsh plugin --profile web add dsh-team-presets
```

把 `web` 换成你实际的 profile 名。要固定本版：

```sh
dsh plugin --profile web add dsh-team-presets@0.2.4
```

> **为什么推荐 npm**：只有从 registry 安装的插件才会被插件管理器**自动检测新版本**。管理器只放行 `kind === 'registry'` 的来源（见 `plugin-manager/src/index.ts` 的 `updateRefusal()`），`github:` 会被判定成 `kind: 'git'`，永远不会提示更新。想有更新提示，就用这条。

### 方式二：从 GitHub 安装（不会提示更新）

```sh
dsh plugin --profile web add github:jaxhu1108/dsh-agent-team-presets
```

要固定某个发布 tag：

```sh
dsh plugin --profile web add github:jaxhu1108/dsh-agent-team-presets#v0.2.4
```

> 这条路径**不会**收到更新提示，新版本要手动重装。适合想跟仓库最新提交、或 npm 不可达的场景。
>
> 仓库是**私有**的。拉取前你本机得有 GitHub 凭据（`gh auth login`、SSH key 或 `.netrc` 任选其一），否则会拉取失败。

### 方式三：在 GUI 里点（装本地包）

打开 **全局面板 → 插件 → 添加插件**，在「包名或地址」里粘贴本地绝对路径：

```text
/你的路径/dsh-agent-team-presets
```

> 这是**仓库目录名**，不是 npm 包名。本地路径安装指向仓库根目录即可，包名由其中的 `package.json` 决定（`dsh-team-presets`）。

输入框支持：包名、`name@version`、`github:作者/仓库`、tarball 地址、本地绝对路径。

### 安装后确认

按插件管理器的提示重新加载（或重启 DSH），然后：

1. 打开 **设置 → 智能体团队预设**
2. 确认插件详情显示名称 `dsh-team-presets`、版本 `0.2.4`
3. 确认组件状态是「运行中」

### 注意事项

- **本包自己声明了 `dsh.bundle`**，安装后由插件管理器登记为 profile 的 bundle 层。**不要再手写 loader 条目**——重复条目会让设置存不进去，报错形如：
  ```text
  Configuration for "agent-team-presets" is overridden by a home patch or command-line overlay
  ```
- 同一个包名不能重复安装。要从 GitHub 换成 npm 源，先在插件列表里卸载，再重新粘贴。
- 从开发链接迁移过来时，先移除 `@deepseek-ai/dsh-experimental-agent-team-presets`，再启用本包，然后重启。

---

## 快速开始（五分钟上手）

1. **设置 → 智能体团队预设**，左栏能看到 9 个内置团队。
2. 挑一个接近你需求的，点**复制**（不要直接改内置的，内置的改坏了要「恢复默认预设」才能回来）。
3. 改个名字，写上团队用途。
4. 到队员页，给每个角色配**模型路由**和**工具权限**（这俩是本地字段，不随导出文件走）。
5. 点页脚的**保存**。没保存之前都是草稿。
6. 回到会话，在输入区的团队选择器里选中它。
7. 直接说话就行，例如：

   > 用当前团队。让执行者实现这个功能并补测试，再让审查员独立把关，最后汇总改动和剩余风险。

**想换个活干，就换团队或选「不使用团队」。** 选「不使用团队」后，等队长和所有队员空闲，团队会被卸载，会话回到常规状态——**不会改动你已选的模型**。

---

## 怎么用好一个团队（实践要点）

### 队长的提示词决定成败

队长不是"转发器"，它是**真正干活的智能体**。写队长提示词时写清这几件事：

- **你自己能做什么**：小事直接干，不要为了显得热闹而召唤一堆人。
- **什么情况下叫人**：写具体条件，别写"按需"这种模糊词。
- **绝对不能碰什么**：凭据、生产数据、不可逆删除。
- **交付标准**：结论要有证据，验证到哪一步说到哪一步。

一个可以直接抄的开头：

```
你是工程团队的队长，也是能亲自设计、开发和调试的高级工程师。
1. 从当前请求和工作区真实文件读取代码、约束与已批准决定，不为简单任务遍历仓库。
2. 简单或强依赖连续推理的任务自己处理。仅在明确专业增益、可安全切分，或需要独立审查时才召唤成员。
3. 委派时提供：任务目标、必要证据、允许写入的文件范围、验收要求。
4. 按风险做真实检查并如实陈述；未测、失败、缺口必须明说，不用推测声称完成。
5. 最终简述实现、真实验证、未完成事项。
```

### 成员描述是给队长看的「选人依据」

成员描述（限 200 字符）不是给人看的介绍，是**队长决定叫不叫这个人**的依据。所以要写"这活归他"，而不是"他很厉害"。

- ❌ `资深专家，经验丰富，能力出众`
- ✅ `只读侦察兵：查文档、日志、代码线索，出证据清单，不写业务代码`

### 队员的模型可以不一样

这是本插件最实用的能力之一。典型组合：

| 角色 | 模型选择思路 |
|---|---|
| 队长 | 用你当前会话的强模型，负责判断和整合 |
| 干重活的执行者 | 同款强模型，或更强的 |
| 侦察 / 搜索 / 整理 | 便宜快的小模型足够 |
| 独立审查员 | **故意换个模型**，避免和写代码的同一个脑子犯同样的错 |

### 工具权限：白名单是权限边界，不是装饰

- **默认所有工具**：不限制。
- **自定义白名单**：只给列出的工具。协作工具（`send_message`、`list_agents`、`team_task_*`）需要**显式勾选**，否则队员没法跟你汇报。
- 队长和成员的策略**完全独立**。
- **`skill` 工具永远放行**，且不在可选项里出现。它只负责发布技能目录、加载指令文本，本身不授予任何能力；而宿主会把整个技能目录从看不到该工具的角色那里收起。所以把它做成勾选框只会误导人。

> ⚠️ **白名单不是文件系统沙箱，也不是网络沙箱。** 允许了 `bash` 的角色，就能干 `bash` 能干的一切。真正的隔离靠运行时权限等级和审批策略。

### 三个容易踩的坑

1. **队员召唤是模板实例化，不是"复用同一个人"**。每次召唤生成唯一 target（`executor`、`executor-2`……）。想让同一个队员接着干，用 `send_message` 发给他已有的 target，**不要重新召唤**。
2. **改了预设不等于当场生效**。空闲会话保存后立即生效；正在跑任务的会话会在**下一次任务开始前**才采用新定义，当前任务保留它启动时的那份定义。
3. **正在执行时不能改预设**。团队里有成员在跑（running / provisioning），`update_team_preset` 会拒绝，返回 `team-busy`。等跑完或中断掉再改。

---

## 字段速查

| 字段 | 说明 |
|---|---|
| 团队名称 / 用途 | 标识预设，说明适合什么活 |
| 所属分类 | 归到自建分类，纯本地，不随文件导出 |
| 展示元数据 | 简介、标签、适用场景、推荐任务、备注。**纯展示，绝不注入 LLM 上下文**，不烧 token |
| 队长 | 会话的主智能体。非空提示词会**替换**它的 persona 前缀；队长始终用会话当前模型 |
| 成员 | 队长可召唤的角色模板 |
| 名称 | 显示名 + target 基础。ASCII 字母/数字/连字符，≤64 字符，不能叫 `lead` |
| 描述 | 给队长看的选人依据，建议 ≤200 字符 |
| 颜色 | 设置页和名册里的区分色 |
| 提供商 / 模型 | **仅成员**。留空 = 继承队长路由 |
| 思考强度 | **仅成员**。取决于模型支持，留空 = 路由默认 |
| 允许的工具 | 所有工具 / 自定义白名单 |
| Team Skills | 专属技能。召唤时**只在该 Agent 作用域**注册 |
| 系统提示词 | 固定角色指令。`{{变量}}` 会当模板变量处理 |
| **队长人事权限** | v0.2.0 新增。允许队长自己增删改队员，见下节 |

---

## 队长人事权限（v0.2.0 新增）

**让队长自己管队员名单，不用每次都由人去设置页改。**

**怎么开**：团队编辑页里有个「队长团队成员管理权限」开关。**默认关闭**。

**开启即授权**：这个开关本身就是你的授权动作，所以队长改名单时**不会再逐次弹审批**。（原因很实在：`完全权限` 档位捆绑了「从不询问」的审批策略，如果写入必须过审批，那开关写着「开」但队长永远写不进去。）

**开着的时候，队长能做**：
- 新增成员、改成员名字
- 改成员的描述、系统提示词
- 改成员的 provider / 模型 / 思考强度
- 改成员的工具权限
- 移除成员

**两条护栏**（防止队长把自己人废掉）：
1. `自定义` 模式配**空**工具列表 → 直接拒绝。空白名单等于"一个工具都不许"，跟打错字没法区分。
2. 切回 `所有工具` 时**清空已存白名单**。否则日后切回自定义，会悄悄复活一个没人重选过的限制。

**一条权限护栏**：会话权限等级是「仅可查看」（read-only）时，成员名单写入被拒。因为那个档位的意思是"这个会话什么都不改"，不只是"不许改预设"。

**生效时机**：名单改动在**下一个任务边界**生效，不在改它的那一轮内生效——名单在工具集注册时就已解析完毕。

> 成员的工具权限**只能在设置页改**，不对队长开放。这是刻意的：工具权限是安全边界，人手确认更合适。

---

## 内置预设

全新安装会初始化 **9 套可编辑团队**，分两个系列。

### 研发规模系列

| 预设 | 角色 | 适合 |
|---|---|---|
| **轻量研发团队**<br>`builtin-lightweight` | 队长、全栈顾问、研发执行者 | 小型功能与模块迭代 |
| **标准研发团队**<br>`builtin-standard` | 队长、系统架构师、研发执行者、独立代码审查员 | 标准软件项目 |
| **全栈软件研发团队**<br>`builtin-fullstack` | 队长、后端架构师、UI 设计师、研发执行者、独立审查员 | Web / 桌面 / Android 跨端复杂工程 |

### 工作模式系列

| 预设 | 角色 | 适合 |
|---|---|---|
| **需求探索**<br>`builtin-discovery` | 队长、需求挖掘专家、方案探索者、独立质疑者 | 想法还雏形，目标没定 |
| **架构规划**<br>`builtin-planning` | 队长、架构设计专家、技术选型评估者、风险合规审计员 | 目标明确，但结构契约要深设计 |
| **既定工作流执行**<br>`builtin-workflow` | 队长、流程调度专家、任务执行者、成果验收员 | 项目已有成熟方案，只需执行 |
| **工程研发协作**<br>`builtin-engineering` | 队长、架构顾问、研发执行者、代码审查员、仓库交付专家 | 功能开发 + 跨层实现 + 规范交付 |
| **独立代码与安全审计**<br>`builtin-audit` | 队长、漏洞分析专家、代码安全审计员、依赖合规检查员 | 对代码 / 配置 / 依赖做只读审查 |
| **科研协作**<br>`builtin-research` | 队长、领域调研专家、实验与数据分析员、学术严谨性审查员 | 文献综述、实验设计、数据分析 |

**内置预设每个 profile 只初始化一次**。你改过或删过会被记住。点**恢复默认预设**会把内置字段和角色名单还原，但**保留你配的模型路由和工具权限**（那俩是本地字段）。

> 📁 想看每套预设的完整 JSON 定义？见 [`contrib/default-presets/`](<contrib/default-presets>)。
> 📁 想看一套**带人事权限开关的完整示例**？见 [`examples/`](<examples>)。

---

## 私有 Team Skill（角色级技能隔离）

这是本插件和原生能力差异最大的一块。

**普通 DSH 技能是全局注册的**——所有智能体都看得见。本插件做了一套私有库：

1. **私有存储**：技能存在插件自己的目录（`~/.dsh/team-skills`），不污染宿主全局技能列表。
2. **作用域隔离**：成员被召唤时，绑给它的技能**只在该成员的 Agent Scope 内注册**。其他队员和队长既看不到也调不了。
3. **随包 4 个技能**：
   - 交付型：`github-repository-presentation`、`git-release-hygiene`
   - 方法型：`grilling`（先澄清再动手）、`research`（只认一手来源）
4. **可改可还原**：内置技能只读，但可以**创建本地可编辑副本**；插件升级时会提示 `updateAvailable`，随时能「恢复为插件内置版本」。
5. **来源色标**：插件内置（蓝）/ 自定义（紫）/ 本地副本（琥珀）。

**导入与依赖检查**：
- 支持导入技能文件夹或 `.zip`。
- 声明的 CLI 可执行程序会在宿主 `PATH` 上**真实查找**（Windows 也遵守 `PATHEXT`）；缺失时标记并在分配时阻断（`dependency-missing`）。
- 声明的 MCP 服务**只做声明式展示，不自动拉起、不自动连接**，标记为 `unverified` 且不阻断分配。MCP 生命周期归你的 profile 管。

**强阻断删除**：技能只要还被任何角色绑定、被活跃成员占用、或被其它技能依赖，删除就被拒绝，弹窗会列出**所有**持有者（例如 `标准研发团队 → executor`），确认按钮置灰。

---

## 分享团队预设

**导出**把团队存成 JSON 文件，**导入预设**读回来。

| 会带走的字段 | 留在本地的字段 |
|---|---|
| 团队名称、用途、展示元数据 | 模型路由、思考强度 |
| 队长和成员的名称、描述、提示词、颜色 | 工具权限 |
| 人事权限开关（v0.2.0 格式） | 本地分类归属 |

导入遇到同名团队时，可以选**覆盖**或**改名新建**。覆盖会保留原角色的本地模型路由和工具策略。

> ⚠️ 导入陌生来源的预设前，**先读一遍它的提示词和权限**。预设里的系统提示词会真的进入运行时。

---

## 面向智能体的工具

根会话会注册这些工具，队长在工具策略允许时可直接用：

| 工具 | 作用 |
|---|---|
| `get_team_preset` | 读当前/指定团队预设，含完整成员配置和设置修订号 |
| `update_team_preset` | 用 CAS 修订号改团队。人事权限开启时可增删改队员；否则只改描述和提示词 |
| `list_team_skills` | 列私有库技能、来源、依赖、角色分配状态 |
| `assign_team_skill` | 给某角色分配技能（作用域限定该 Agent） |
| `unassign_team_skill` | 解除分配 |
| `remove_team_skill` | 从私有库删除（受阻断规则保护） |

---

## 排障

| 现象 | 查什么 |
|---|---|
| 看不到设置页 / 插件 pending | profile 类型对不对、DSH 版本是否 ≥ `0.2.2-rc.1`、Agent Teams 有没有启用 |
| `Configuration for "agent-team-presets" is overridden...` | profile patch、`$DSH_HOME/cordis.patch.yml`、`--patch` 里有重复手写条目，删掉重复项 |
| 技能删除按钮置灰 | 技能受保护。看弹窗里的阻断列表，先去对应团队角色里取消分配 |
| 技能分配报 `dependency-missing` | 技能声明的某个命令行程序在 `PATH` 上找不到 |
| 成员创建被拒 | 持久存储、执行后端（`spawn`/`fork`）、模型配额、并发上限 |
| 成员显示的模型和配置不一致 | rc.2/rc.3 里 `list_agents.model` 读的是 fallback 元数据。**实际路由以 `spawn_team_member` 返回的 `configuredRoute` 为准** |
| 队长说改完名单没反应 | 名单在下一个任务边界生效，不是当轮 |

---

## 界面预览

以下截图展示设置页团队管理、私有技能库与输入区选用流程。模型名和工具取决于你的实际部署。

**管理已保存的团队：标签页、搜索、来源与系列筛选**

![设置中的团队列表](<docs/shots/teams-list.png>)

**在会话输入区选择团队**

![会话输入区的团队选择器](<docs/shots/composer-picker.png>)

**私有 Team Skill 技能库**

![团队技能库列表](<docs/shots/skills-library.png>)

**为成员角色分配专属技能**

![成员专属技能分配九宫格](<docs/shots/member-skill-grid.png>)

**技能详情与本地副本管理**

![技能详情页面](<docs/shots/skill-git-release-hygiene.png>)

**技能删除强阻断弹窗**

![技能删除阻断弹窗](<docs/shots/skill-delete-dialog.png>)

**团队预设分类管理**

![团队分类管理页面](<docs/shots/category-manager.png>)

**团队编辑页**

![团队编辑页面](<docs/shots/team-editor.png>)

<details>
<summary>更多截图（模型路由、下拉交互、系统提示词、工具策略）</summary>

![分类下拉弹层](<docs/shots/category-select-popup.png>)

![自定义来源筛选](<docs/shots/teams-custom-source.png>)

![成员模型设置](<docs/images/04-member-route.png>)

![模型选择器](<docs/images/05-model-picker.png>)

![队长系统提示词](<docs/images/06-captain-system-prompt.png>)

![成员系统提示词](<docs/images/07-member-system-prompt.png>)

![默认工具策略](<docs/images/08-tools-default.png>)

![自定义工具策略](<docs/images/09-tools-custom.png>)

</details>

---

## 工作原理

插件通过 Cordis 扩展点与 Runtime 协作，**不改宿主源码**：

1. **Profile 配置**：保存团队预设、展示元数据、本地分类、活动会话选择。
2. **会话应用**：在 Agent 作用域安装队长 persona、工具策略和 `spawn_team_member`。
3. **成员创建**：校验路由与委派配额，写持久快照，召唤子会话。串行 `agent/created` 钩子在首次请求前把模型路由、persona、工具白名单、专属 Team Skill 注入该成员的 Agent 作用域。
4. **私有技能管理**：技能目录存储、防崩溃事务日志、依赖解析、删除阻断核验。

### 源码导航

| 范围 | 源码 |
|---|---|
| 插件生命周期与设置协调 | [src/index.ts](<src/index.ts>)、[src/settings-reconcile.ts](<src/settings-reconcile.ts>) |
| 内置预设目录与系列 | [src/builtin-teams.ts](<src/builtin-teams.ts>)、[src/team-catalog.ts](<src/team-catalog.ts>) |
| 团队应用与成员召唤 | [src/application.ts](<src/application.ts>) |
| 成员快照与运行时注入 | [src/member-store.ts](<src/member-store.ts>)、[src/member-identity.ts](<src/member-identity.ts>)、[src/member-runtime.ts](<src/member-runtime.ts>) |
| 私有 Team Skill 子系统 | [src/team-skills/](<src/team-skills/>) |
| 工具策略与执行器 | [src/tool-policy.ts](<src/tool-policy.ts>)、[src/presentation.ts](<src/presentation.ts>) |
| 预设工具与导入导出 | [src/preset-tools.ts](<src/preset-tools.ts>)、[src/preset-editor.ts](<src/preset-editor.ts>)、[src/preset-transfer.ts](<src/preset-transfer.ts>) |
| 浏览器前端 | [src/client/](<src/client/>) |

---

## 适配说明（给要改代码的人）

本版针对 DSH `0.2.2-rc.1`（以及此前的 `0.2.1-rc.3`）做过一轮 API 迁移。**六个改动点全部记录在 [ADAPTATION.md](<ADAPTATION.md>)**，包含：

- 新旧写法对照（`tools.execute` 批量调用、`presentAs` → `setExecutor`、`turnBoundary` 读取方式……）
- 每条的症状——不改会报什么错
- **一段可以直接粘给你的智能体**、让它照着适配的指令

如果你的 agent 要帮你改这个插件，或者你要把同样的迁移套到别的插件上，先让它读 `ADAPTATION.md`。

---

## 开发与构建

需要一份**装了依赖**的 Runtime 源码 checkout：

```sh
export DSH_CHECKOUT=/绝对路径/deepseek-runtime
npm run typecheck   # host + client 两面
npm run bundle      # 构建 lib/
npm test            # 单元/组合测试
```

构建脚本在临时工作区里镜像 checkout，**绝不写进 Runtime 目录**。

### 测试状态（诚实版）

| 项目 | 结果 |
|---|---|
| 类型检查 host | 0 本地诊断 |
| 类型检查 client | 0 本地诊断 |
| 构建 | 通过，`lib/index.js` SHA256 `5dc3c1dbf55f96857ea313563caca82cda2a40824b52d9d175bb4eb9627b71d1` |
| 全量测试 | **764 个用例：763 通过 / 1 跳过 / 0 失败**（52 个文件全过） |

### 踩过的坑

某些测试要求「祖先目录没有 `node_modules`」（为了证明产物没有裸 `zod` 依赖）。如果 `/tmp` 下有 `node_modules`，`typert-isolation.spec.ts` 整组会报 `No dependency-isolated scratch directory is available`。绕过：

```sh
TMPDIR=/dev/shm npm test
```

---

## 相关资源

- [DeepSeek Runtime](https://github.com/deepseek-ai/deepseek-runtime) —— 宿主与插件系统
- [适配说明](<ADAPTATION.md>) —— rc.2 → rc.3 的六个 API 迁移点
- [内置预设 JSON](<contrib/default-presets>) —— 9 套团队的完整定义，可直接导入
- [脱敏示例](<examples>) —— 一套带人事权限开关的完整示例
- [随包技能](<assets/skills>) —— 4 个官方技能的 `SKILL.md`
- [来源与致谢](<CREDITS.md>) —— 上游作者、本分支改动范围、三方素材与许可边界
- [来龙去脉](<NOTES.md>) —— 这个插件从哪里来、本分支做了什么、为什么这样归属

---

## 致谢

**这个插件的开发由原作者 [bloodarea](https://github.com/bloodarea/dsh-agent-team-presets) 启发。** 这句话不是客套，是事实陈述：

- **架构与创意来自上游。** 一个 Host 行同时充当 bundle 与它组合的插件、队长 + 成员的预设数据模型、9 套内置预设、私有 Team Skill 按角色隔离注册的整套机制——这些是原作者想出来的，本仓库沿用。本分支做的是**适配与文档**：跟进 Runtime 的 API 迁移、修执行器生命周期缺陷、补上中文使用门槛、加队长人事权限。分工如此，不宜混淆。
- **上游仓库未被改动。** 本仓库的 `origin` 仍指向上游，但从未向它推送过任何提交。

完整的三方归属、许可边界、以及「基于本仓库再分支时该保留什么」，都写在 [CREDITS.md](<CREDITS.md>)。

其余贡献：

- **张灏焱**：贡献 `grilling` 与 `research` 两个方法型 Team Skill。
- **Matt Pocock**：[skills](https://github.com/mattpocock/skills)，上述两个方法技能改编自它（MIT，见 [NOTICE](<NOTICE>)）。

## 许可证

[MIT](<LICENSE>)。随包第三方依赖许可见 [THIRD-PARTY-NOTICES.txt](<lib/THIRD-PARTY-NOTICES.txt>)；随包方法技能的来源与 MIT 许可见 [NOTICE](<NOTICE>)。

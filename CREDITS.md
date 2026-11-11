# 来源与致谢 · Origins and Credits

本仓库是一个**下游适配分支**，不是从零开始的独立作品。它的存在建立在他人的工作之上，这一页把关系写清楚。

*This repository is a downstream adaptation fork, not an independent work built from nothing. This page states the relationship plainly.*

---

## 一、起点：上游作者

**原项目**：[bloodarea/dsh-agent-team-presets](https://github.com/bloodarea/dsh-agent-team-presets)
**原作者**：**bloodarea**
**npm**：[dsh-agent-team-presets](https://www.npmjs.com/package/dsh-agent-team-presets)

这个插件的**全部设计起点**来自上游。具体来说，下列内容由原作者创作，本仓库沿用而非重写：

| 范围 | 说明 |
|---|---|
| 插件整体架构 | 一个 Host 行同时充当 bundle 与它组合的插件；`dsh.bundle.patch` 装配方式 |
| 团队预设数据模型 | 队长 + 成员的配置结构、每成员独立的 provider / 模型 / 思考强度 / 工具白名单 |
| 9 套内置预设 | `contrib/default-presets/` 下全部团队的原始设定 |
| 私有 Team Skill 子系统 | 技能目录存储、事务日志、依赖解析、按角色作用域隔离注册的整套机制 |
| 浏览器前端 | 设置页、输入区团队选择器、预设编辑器、导入导出界面的原始实现 |
| 面向智能体的工具面 | 预设读写、技能管理、成员召唤等工具的定义与语义 |

没有上游的这些打底，本仓库没有可以「适配」的对象。**原作者是这项工作的真正起点。**

---

## 二、本分支做了什么

本仓库的工作集中在**让它在新版 Runtime 上继续可用，并补上使用门槛**。相对上游的增量：

| 增量 | 性质 |
|---|---|
| Runtime API 迁移（rc.2 → rc.3 → 0.2.2） | 适配。上游停在某个版本，本分支跟进后续 Runtime 的接口变化 |
| 修掉 `setExecutor` 释放后留下永久墓碑的执行器缺陷 | 修 bug。绑定到 Agent 生命周期而非插件卸载 |
| 队长人事权限（`personnelControl`） | 新功能。允许队长在运行中增删改队员 |
| 中文文档与 `ADAPTATION.md` | 文档。把迁移点写成别的 agent 能直接照做的东西 |
| 脱敏示例团队 | 文档。一套可直接导入的真实配置 |
| 打包与发布整理 | 工程。`files` 白名单、凭据扫描、构建校验 |

**一句话**：上游提供骨架与创意，本分支负责让它活下去、并解释清楚怎么用。

---

## 三、三方素材

| 来源 | 内容 | 许可 |
|---|---|---|
| **张灏焱** | 贡献 `grilling`、`research` 两个方法型 Team Skill | MIT |
| **Matt Pocock** — [skills](https://github.com/mattpocock/skills) | 上述两个方法技能改编自它，pin 到 commit `5beb35b0` | MIT，全文见 [NOTICE](<NOTICE>) |

---

## 四、许可与归属

[MIT](<LICENSE>)。`LICENSE` 里并列保留两行版权：

```
Copyright (c) 2026 bloodarea (original author)
Copyright (c) 2026 Jax (modifications and packaging in this fork)
```

MIT 允许修改与再分发，但不允许抹掉原始署名。**本仓库不抹。** 任何再分发本仓库的人，也应当保留这两行。

上游仓库本身**未做任何改动**——本分支的 remote `origin` 仍指向上游，但从未向它推送。

---

## 五、如果你要基于本仓库再做分支

请照做：

1. 保留 `LICENSE` 里的 original author 一行。
2. 在 `CREDITS.md` 里说明你的改动范围，别把上游的工作算成自己的。
3. 如果改的是 Runtime 适配，先读 [ADAPTATION.md](<ADAPTATION.md>)——那里记了踩过的坑。

这样这条线才能一直往回追到真正的起点。

---

<sub>本页中英文合并版。English readers: the table in section 一 and 二 is the substance; the rule is simple — the architecture, the preset model, the built-in teams and the Team Skill subsystem come from **bloodarea**, and this fork adapts them to newer Runtime releases and documents how. Keep both copyright lines.</sub>

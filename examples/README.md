# 示例团队预设（脱敏）

本目录提供一个**脱敏的参考团队预设**，用来学习「写得好的团队预设长什么样」：真实的工程角色分工、能落到实处的 systemPrompt、以及人事控制（personnelControl）开启后的写法。

- `engineering-team-with-personnel-control.json` —— 队长 + 4 名成员（架构顾问、执行者、审查员、交付工程师），`personnelControl: true`。

所有内容已脱敏：不含真实人名、项目名、主机名、路径、内网地址、模型名与任何凭据。`provider` / `model` 这类本地字段完全不出现在文件里（原因见下文「哪些字段不随文件走」）。

## 怎么导入

1. 打开设置页的团队预设区域；
2. 点「导入预设」，选择本目录的 JSON 文件；
3. 导入后按自己部署的实际情况补填每个角色的模型路由与工具权限。

文件是 **version 3**；如果你手写文件想兼容老版本插件，用 `version: 2` 且不要带 `personnelControl` 字段。

## 每个字段演示了什么

| 字段 | 演示内容 |
| --- | --- |
| `format` | 固定为 `dsh-agent-team-preset`，用来和普通 JSON 区分。 |
| `version` | `3` 表示文件带 `personnelControl`；`2` 是老格式（不含该字段）。 |
| `team.name` / `team.description` | 团队名与一句话定位，会显示在选择器里。 |
| `team.personnelControl` | `true` = 队长可以在会话中按实际需要增减、调整成员，而不是把成员名单写死。 |
| `team.metadata.summary` | 一句话摘要（上限 500 字）。 |
| `team.metadata.tags` | 检索用标签，单条 ≤64 字、最多 30 条。 |
| `team.metadata.useCases` | 适用场景，单条 ≤200 字、最多 20 条。 |
| `team.metadata.quickPrompts` | 一键填入的快捷指令，单条 ≤500 字、最多 20 条。 |
| `team.metadata.notes` | 使用提示（上限 2000 字）。 |
| `team.captain` | 队长的 `name` / `description` / `color` / `systemPrompt`。 |
| `team.members[].name` | 成员显示名。用小写连字符（`reviewer`、`release-engineer`）时，召唤用的目标名就等于它。 |
| `team.members[].description` | 一句话职责，会出现在队长看到的成员名册里。 |
| `team.members[].color` | 强调色，`#rrggbb`；留空用主题默认值。 |
| `team.members[].systemPrompt` | 角色的长期指令：职责、边界、交付格式、诚实要求。这是整个文件最有价值的部分。 |
| `team.officialSkills` | 把插件随包发布的技能分配给某个角色，`roleName` 必须能在此文件中按名字匹配到（不区分大小写）。本示例把 `git-release-hygiene` 分给 `release-engineer`。可用的随包技能：`github-repository-presentation`、`git-release-hygiene`、`grilling`、`research`。 |

## 哪些字段不随文件走

以下内容属于**本地部署**，刻意不写进预设文件，因为它们换一台机器就可能不成立：

- **模型路由**（`provider` / `model` / `reasoningEffort`）：路由里的 provider 名称只在这套部署里有效，换环境就可能根本没有这个 provider。
- **工具权限**（`toolMode` / `tools` 允许列表）：允许列表里写死的工具名，换部署后可能根本不存在，那样成员会看起来正常却什么都调不动。

所以这两类字段**一旦出现在文件里就会被整份拒绝**（`unsupported-fields`），而不是被静默丢弃——这样导入方永远不会以为自己导入了其实没带进来的东西。模型路由和工具权限请在导入后到设置页按自己部署的实际情况配置。

同理，成员 ID、分类归属、本地路径、以及技能的正文都不属于预设文件。

## 校验过的行为（实测）

用 `src/client/preset-file.ts` 的 `parseTeamPresetFile`（设置页导入走的就是这条路）实测：

| 输入 | 结果 |
| --- | --- |
| 本示例文件（`version: 3` + `personnelControl: true`） | `ok: true`，`personnelControl` 读入为 `true`，4 名成员 |
| `version: 2` + 带 `personnelControl` | 拒绝，`unsupported-fields` |
| `version: 3` + 缺 `personnelControl` | 拒绝，`invalid-format` |
| 任一 slot 带 `toolMode` / `tools` / `provider` | 拒绝，`unsupported-fields` |
| 成员名重复（仅大小写不同也算重复） | 拒绝，`duplicate-members` |
| `metadata` 里出现未知键 | 拒绝，`unsupported-fields` |

另外，核心解析器 `parseTeamPresetText` 只认 `version` 1 和 2，直接喂 `version: 3` 会返回 `unsupported-version`；这是预期行为——文件导入入口 `parseTeamPresetFile` 会先把 v3 归一化成 v2 再交给核心解析。

## 写自己的预设时的几个要点

1. **systemPrompt 写职责与边界，不写口号。** 每段都要能回答：这个角色做什么、不做什么、交付什么格式、什么情况必须回报而不是自己决定。
2. **写清楚"不采信自述、只认证据"这类验收纪律。** 这是团队协作最容易翻车的地方。
3. **成员的 `name` 用英文小写连字符**（`release-engineer`），这样召唤目标名可预测；中文名会被转成 `member-<序号>`。
4. **`quickPrompts` 写成可以直接发的完整句子**，别写关键词。
5. **`officialSkills` 只引用随包发布的技能 ID**，不要写本地技能路径。

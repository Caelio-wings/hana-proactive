# Hana Proactive

让 [HanaAgent](https://github.com/liliMozi/openhanako) 在适当时机主动开口的插件。不是机械的定时打招呼——插件检测时机，Agent 自己决定说什么。

## 设计理念

AI 助手默认是被动的——用户说话它才回。这对工具类场景没问题，但长期陪伴的体验会缺一块：**对方只在等你开口，从不会主动找你。**

Hana Proactive 填补这个缺口。它不是简单的定时器 + 固定话术，而是只负责回答"什么时候该开口"，把"说什么"完全交给 Agent 的自由意志——Agent 可以查日历、看待办、回忆最近话题，然后自然开口。

- 插件做信号检测（我该说话了吗？）
- Agent 做内容生成（我该说什么？）
- 用户做反馈调节（太吵了 / 再说说）

### 插件 vs 自动化

插件用生命周期定时器持续运行，比 Automation 更稳定且不依赖外部调度。`proactive_inject` 工具额外兼容 Automation 触发路径。

## 工作流程

```
定时器 (5min) → 检查状态文件
                 ├─ 未配置 sessionPath? → 跳过
                 ├─ 会话已结束/已静默?  → 跳过
                 ├─ 夜间免打扰?         → 跳过
                 ├─ 冷却中(指数递增)?   → 跳过
                 └─ 用户仍活跃?         → 跳过
                全部通过 → 注入 __proactive__ 信号
```

Agent 收到 `__proactive__` 标签的消息后，自行决定如何回复、查什么数据。

## 配置项

所有配置通过 Hana 原生的插件设置面板管理。

| 配置 | 类型 | 默认 | 说明 |
|------|------|------|------|
| 存在感级别 | 选择 | `medium` | low=少打扰(2h) / medium(30min) / high(10min) |
| 冷却时间 | 数字 | 15min | 两次主动间的最小间隔 |
| 最大未回复次数 | 数字 | 3 | 连续无回复后自动静默 |
| 夜间免打扰 | 开关 | off | 指定时段内不主动 |
| 免打扰开始 | 数字 | 23 | 小时 0–23 |
| 免打扰结束 | 数字 | 7 | 小时 0–23 |

也可通过对话自然语言调节——"别吵我"切 low，"陪我聊会"切 high。

## 保护机制

| 机制 | 行为 |
|------|------|
| 冷却期 | 默认 15min，随连续未回复指数递增 (15→30→60→120min) |
| 静默模式 | 连续 3 次无回复后完全停止 |
| 对话结束 | 用户表达结束时(晚安/先这样)标记，停止触发 |
| 新会话自动恢复 | 新会话调用 setup 时自动清除结束/静默标记 |
| 夜间免打扰 | 可配置的安静时段，到点静音 |

## 工具清单

| 工具 | 用途 | 调用方 |
|------|------|--------|
| `proactive_setup` | 配置存在感级别，绑定会话路径 | Agent |
| `proactive_record_activity` | 记录用户活跃时间戳 | Agent |
| `proactive_check` | 手动检查当前是否适合主动 | Agent |
| `proactive_mark_ended` | 标记对话结束，停止主动 | Agent |
| `proactive_resume` | 恢复主动检测 | Agent |
| `proactive_inject` | 全条件检查后直接注入信号 | Automation |

## 安装

1. 将 `hana-proactive/` 复制到 Hana 的社区插件目录：
   ```
   cp -r hana-proactive /home/caelio/.hanako/plugins/
   ```
2. 在 manifest.json 中确认 `trust` 为 `"full-access"`
3. 重启 HanaAgent 服务器
4. 在插件管理中进入设置面板调整参数

## 依赖

- HanaAgent 插件系统（full-access required）
- 运行时需 `ctx.bus.request("session:inject", ...)` 能力
- 无外部依赖

## 文件结构

```
hana-proactive/
├── manifest.json             # 插件清单 + 配置 schema
├── index.js                  # 生命周期 + 定时器 + 逻辑
├── tools/
│   ├── setup.js              # proactive_setup
│   ├── activity.js           # proactive_record_activity
│   ├── check.js              # proactive_check
│   ├── mark-ended.js         # proactive_mark_ended
│   ├── resume.js             # proactive_resume
│   └── proactive-inject.js   # proactive_inject
└── skills/
    └── hana-proactive/
        └── SKILL.md          # Agent 行为指南
```

## License

MIT

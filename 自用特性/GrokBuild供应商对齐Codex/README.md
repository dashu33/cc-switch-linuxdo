# GrokBuild 供应商对齐 Codex

> 维护目录：`自用特性/GrokBuild供应商对齐Codex/`

## 目标与范围

让 Grok Build 供应商在日常使用上对齐 Codex 第三方供应商：

- 卡片快捷：上游格式 / 模型 / 获取
- “需要路由”提示
- 批量模型探测与用量入口可用
- 同时抽出可复用的全局快捷调整框架，避免只给 Grok 打补丁
- 代理回写 Responses usage 时补齐 Grok CLI 必填字段，避免终端直接失败

## 用户行为

1. 打开 Grok Build 供应商页。
2. 卡片上可直接切换上游格式（Chat / Responses / Anthropic）。
3. 卡片上可选择或手填模型，并可一键“获取”模型列表。
4. 当格式为 Chat 或 Anthropic 时，卡片显示“需要路由”。
5. 子菜单批量模型探测可覆盖 Grok Build 供应商。
6. 用量脚本配置可从 Grok TOML 解析 baseUrl/apiKey。
7. 导入 provider 后在终端启动 Grok，正常对话，不再因 usage 缺字段直接 `Turn failed`。

## 关键决策

1. **不改 Grok 原生协议**：仍使用 `settingsConfig.config` = Grok TOML。
2. **全局框架优先**：`providerQuickAdjust` 统一判断哪些 App 开快捷条、如何解析/写入 format、是否需路由。
3. **格式双写**：
   - `meta.apiFormat` 控制代理层转换
   - Grok TOML `api_backend` 同步：
     - `openai_chat` → `chat_completions`
     - `openai_responses` → `responses`
     - `anthropic` → `messages`
4. **第一批只覆盖网关类快捷能力**，不做 Grok 官方 OAuth/订阅额度。
5. **Responses usage 形状强制补齐**：
   - Grok Build 客户端反序列化要求 `usage.input_tokens_details` 存在
   - 上游/转换层常在无缓存时省略该字段
   - 代理对 `codex` / `grokbuild` 的 Responses 路径始终补：
     - `input_tokens_details.cached_tokens`
     - `input_tokens_details.cache_write_tokens`
     - `output_tokens_details.reasoning_tokens`

## 非目标

- 不把 Grok 配置改成 Codex TOML
- 不做 Codex OAuth / 官方订阅面板
- 不重做 Grok 编辑表单（表单已复用 Codex 字段）
- 不伪造真实缓存用量；仅补 0 值占位

## 验收标准

- [x] Grok 卡片出现与 Codex 类似的快捷条
- [x] 切换格式后重进仍保留，且 TOML `api_backend` 同步
- [x] 卡片可获取并切换模型
- [x] Chat/Anthropic 显示“需要路由”，Responses 不显示
- [x] 批量模型探测可用于 Grok
- [x] Chat→Responses / Anthropic→Responses 转换出的 usage 始终含 `input_tokens_details`
- [x] Grok/Codex Responses 透传路径也会补齐缺失的 usage 细节
- [x] 相关单测/编译检查通过

## 回归清单

1. Codex / Claude 原有卡片快捷能力不回退
2. Grok 编辑弹窗原有端点测速/本地代理覆写仍可用
3. 复制到 Grok Build 后仍能卡片快捷调整
4. 终端启动 Grok 后发一条简单请求，不再出现：
   `serialization error: missing field \`input_tokens_details\``
5. Claude / Gemini 透传路径不被额外改写


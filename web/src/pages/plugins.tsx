import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { api } from "../lib/api";
import { Github, Download, Check, X, Trash2, Send, ArrowLeft, ExternalLink, BookOpen } from "lucide-react";

const statusMap: Record<string, { label: string; variant: "default" | "outline" | "destructive" }> = {
  approved: { label: "已通过", variant: "default" },
  pending: { label: "待审核", variant: "outline" },
  rejected: { label: "已拒绝", variant: "destructive" },
};

export function PluginsPage() {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [tab, setTab] = useState<"marketplace" | "submit" | "review">("marketplace");
  const [user, setUser] = useState<any>(null);

  async function load() {
    try { setUser(await api.me()); } catch { /* not logged in */ }
    try {
      const status = tab === "review" ? "pending" : "approved";
      setPlugins(await api.listPlugins(status) || []);
    } catch { setPlugins([]); }
  }

  useEffect(() => { load(); }, [tab]);

  const isLoggedIn = !!user;
  const isAdmin = user?.role === "admin";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="font-semibold text-sm">Webhook 插件市场</span>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/webhook-plugins/skill.md" target="_blank" rel="noopener">
            <Button variant="ghost" size="sm" className="text-xs"><BookOpen className="w-3.5 h-3.5 mr-1" /> 开发文档</Button>
          </a>
          {!isLoggedIn && (
            <Link to="/login"><Button size="sm" className="text-xs">登录</Button></Link>
          )}
          {isLoggedIn && (
            <span className="text-xs text-muted-foreground">{user.username}</span>
          )}
        </div>
      </header>

      <main className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            社区驱动的 Webhook 插件，一键安装到你的渠道。代码公开审核，安全沙箱执行。
          </p>
          <div className="flex border rounded-lg overflow-hidden shrink-0">
            <button className={`px-3 py-1 text-xs cursor-pointer ${tab === "marketplace" ? "bg-secondary" : "text-muted-foreground"}`} onClick={() => setTab("marketplace")}>市场</button>
            {isLoggedIn && (
              <button className={`px-3 py-1 text-xs cursor-pointer ${tab === "submit" ? "bg-secondary" : "text-muted-foreground"}`} onClick={() => setTab("submit")}>提交插件</button>
            )}
            {isAdmin && (
              <button className={`px-3 py-1 text-xs cursor-pointer ${tab === "review" ? "bg-secondary" : "text-muted-foreground"}`} onClick={() => setTab("review")}>审核</button>
            )}
          </div>
        </div>

        {tab === "marketplace" && (
          <div className="space-y-3">
            {plugins.length === 0 && (
              <div className="text-center py-12 space-y-2">
                <p className="text-sm text-muted-foreground">暂无插件</p>
                {isLoggedIn && <p className="text-xs text-muted-foreground">成为第一个贡献者，<button className="text-primary hover:underline cursor-pointer" onClick={() => setTab("submit")}>提交你的插件</button></p>}
              </div>
            )}
            {plugins.map((p) => <PluginCard key={p.id} plugin={p} onRefresh={load} isAdmin={isAdmin} isLoggedIn={isLoggedIn} mode="marketplace" />)}
          </div>
        )}

        {tab === "submit" && <SubmitForm onSubmitted={() => { setTab("marketplace"); load(); }} />}

        {tab === "review" && (
          <div className="space-y-3">
            {plugins.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">没有待审核的插件</p>}
            {plugins.map((p) => <PluginCard key={p.id} plugin={p} onRefresh={load} isAdmin={true} isLoggedIn={true} mode="review" />)}
          </div>
        )}
      </main>
    </div>
  );
}

function PluginCard({ plugin, onRefresh, isAdmin, isLoggedIn, mode }: {
  plugin: any; onRefresh: () => void; isAdmin: boolean; isLoggedIn: boolean; mode: string;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [showScript, setShowScript] = useState(false);

  async function handleInstall() {
    const data = await api.installPlugin(plugin.id);
    await navigator.clipboard.writeText(data.script);
    alert("脚本已复制到剪贴板！\n\n使用方法：进入 Bot → 渠道 → Webhook 配置 → 粘贴到脚本框中");
    onRefresh();
  }

  async function handleReview(status: string) {
    let reason = "";
    if (status === "rejected") {
      reason = prompt("请输入拒绝原因：") || "";
      if (!reason) return;
    }
    await api.reviewPlugin(plugin.id, status, reason);
    onRefresh();
  }

  async function handleDelete() {
    if (!confirm("确认删除此插件？")) return;
    await api.deletePlugin(plugin.id);
    onRefresh();
  }

  async function toggleScript() {
    if (!detail) {
      try { setDetail(await api.getPlugin(plugin.id)); } catch {}
    }
    setShowScript(!showScript);
  }

  const s = statusMap[plugin.status] || statusMap.pending;
  const config = plugin.config_schema || [];
  const grants = (plugin.grant_perms || "").split(",").filter(Boolean);
  const matchTypes = plugin.match_types || "*";
  const connectDomains = plugin.connect_domains || "*";
  const riskLevel = connectDomains === "*" && grants.includes("reply") ? "high"
    : connectDomains === "*" || grants.includes("reply") ? "medium" : "low";
  const riskColors = { low: "text-primary", medium: "text-yellow-500", high: "text-destructive" };
  const riskLabels = { low: "低风险", medium: "中风险", high: "高风险" };

  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {plugin.icon && <span>{plugin.icon}</span>}
            <span className="font-medium text-sm">{plugin.name}</span>
            <Badge variant={s.variant} className="text-[10px]">{s.label}</Badge>
            <span className="text-[10px] text-muted-foreground">v{plugin.version}</span>
            {plugin.license && <span className="text-[10px] text-muted-foreground">{plugin.license}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{plugin.description}</p>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
            <span>by {plugin.author || "anonymous"}</span>
            {plugin.namespace && <span className="font-mono">{plugin.namespace}</span>}
            {plugin.submitter_name && <span>提交：{plugin.submitter_name}</span>}
            {plugin.reviewer_name && <span>审核：{plugin.reviewer_name}</span>}
            <span>{plugin.install_count} 次安装</span>
            {(plugin.github_url || plugin.homepage) && (
              <a href={plugin.homepage || plugin.github_url} target="_blank" rel="noopener" className="flex items-center gap-0.5 hover:text-primary">
                <Github className="w-3 h-3" /> 源码
              </a>
            )}
            {plugin.commit_hash && <span className="font-mono">{plugin.commit_hash.slice(0, 7)}</span>}
          </div>
          {/* Security info — always show for review, compact for marketplace */}
          <div className="flex items-center gap-2 mt-1 text-[10px] flex-wrap">
            <span className={riskColors[riskLevel]}>{riskLabels[riskLevel]}</span>
            <span className="text-muted-foreground">权限: {grants.length > 0 ? grants.join(", ") : "none"}</span>
            <span className="text-muted-foreground">消息: {matchTypes}</span>
            <span className="text-muted-foreground">域名: {connectDomains}</span>
          </div>
          {plugin.reject_reason && (
            <p className="text-[10px] text-destructive mt-0.5">拒绝原因：{plugin.reject_reason}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {plugin.github_url && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={toggleScript}>
              {showScript ? "收起" : "源码"}
            </Button>
          )}
          {mode === "marketplace" && plugin.status === "approved" && isLoggedIn && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleInstall}>
              <Download className="w-3 h-3 mr-1" /> 安装
            </Button>
          )}
          {mode === "review" && (
            <>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={toggleScript}>
                {showScript ? "收起" : "脚本"}
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => handleReview("approved")}>
                <Check className="w-3 h-3 mr-1" /> 通过
              </Button>
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleReview("rejected")}>
                <X className="w-3 h-3 mr-1" /> 拒绝
              </Button>
            </>
          )}
          {isAdmin && (
            <Button size="sm" variant="ghost" className="h-7" onClick={handleDelete}>
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {config.length > 0 && (
        <div className="text-[10px] text-muted-foreground">
          配置项：{config.map((c: any) => `${c.name} (${c.description || c.type})`).join("、")}
        </div>
      )}

      {showScript && (detail?.script || plugin.github_url) && (
        <div className="space-y-1">
          {detail?.script ? (
            <pre className="text-[10px] bg-card border rounded p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">{detail.script}</pre>
          ) : (
            <a href={plugin.github_url} target="_blank" rel="noopener" className="text-xs text-primary flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> 在 GitHub 查看源码
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

function SubmitForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [mode, setMode] = useState<"github" | "paste">("github");
  const [url, setUrl] = useState("");
  const [script, setScript] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = mode === "github" ? { github_url: url.trim() } : { script: script.trim() };
    if (!data.github_url && !data.script) return;
    setSubmitting(true);
    setError("");
    try {
      await api.submitPlugin(data);
      setUrl(""); setScript("");
      onSubmitted();
    } catch (err: any) {
      setError(err.message);
    }
    setSubmitting(false);
  }

  const canSubmit = mode === "github" ? !!url.trim() : !!script.trim();

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h3 className="text-sm font-medium">提交 Webhook 插件</h3>
        <p className="text-xs text-muted-foreground">
          提交插件后由管理员审核，通过后其他用户可一键安装。
        </p>

        <div className="flex border rounded-lg overflow-hidden w-fit">
          <button className={`px-3 py-1 text-xs cursor-pointer ${mode === "github" ? "bg-secondary" : "text-muted-foreground"}`} onClick={() => setMode("github")}>GitHub 链接</button>
          <button className={`px-3 py-1 text-xs cursor-pointer ${mode === "paste" ? "bg-secondary" : "text-muted-foreground"}`} onClick={() => setMode("paste")}>粘贴脚本</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          {mode === "github" ? (
            <>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/user/repo/blob/main/plugin.js"
                className="h-8 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">系统会自动拉取脚本并固定 commit hash，确保审核的代码就是实际运行的代码。</p>
            </>
          ) : (
            <>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder={"// @name 插件名称\n// @description 插件描述\n// @author 你的名字\n// @version 1.0.0\n\nfunction onRequest(ctx) {\n  // ...\n}"}
                rows={12}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring resize-none"
              />
              <p className="text-[10px] text-muted-foreground">直接粘贴脚本内容，需包含 // @name 元数据声明。</p>
            </>
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={submitting || !canSubmit}>
              <Send className="w-3.5 h-3.5 mr-1" /> {submitting ? "提交中..." : "提交审核"}
            </Button>
          </div>
        </form>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </Card>

      {/* Plugin format specification */}
      <Card className="space-y-3">
        <h3 className="text-sm font-medium">插件开发指南</h3>

        <div className="space-y-3 text-xs">
          <div>
            <p className="font-medium mb-1">基本结构</p>
            <p className="text-muted-foreground mb-2">插件是一个 JavaScript 文件，通过注释声明元数据，导出 onRequest / onResponse 函数。</p>
            <pre className="bg-card border rounded p-3 overflow-x-auto text-[10px]">{`// @name 插件名称（必填）
// @description 插件的功能描述
// @author 你的名字
// @version 1.0.0
// @config webhook_url string "Webhook 地址"
// @config secret string? "签名密钥（可选）"

// 发送前：修改请求
function onRequest(ctx) {
  // ctx.msg  — 收到的消息（只读）
  //   .sender     发送者 ID
  //   .content    文本内容
  //   .msg_type   消息类型 (text/image/voice/video/file)
  //   .channel_id 渠道 ID
  //   .bot_id     Bot ID
  //   .timestamp  时间戳 (ms)
  //   .items[]    消息元素列表
  //
  // ctx.req  — HTTP 请求（可修改）
  //   .url      目标 URL
  //   .method   HTTP 方法
  //   .headers  请求头 (object)
  //   .body     请求体 (string)
  //
  // reply(text)  — 通过 Bot 回复消息给发送者
  // skip()       — 取消这次 webhook 推送
}

// 收到响应后：处理响应
function onResponse(ctx) {
  // ctx.res  — HTTP 响应（只读）
  //   .status   状态码
  //   .headers  响应头 (object)
  //   .body     响应体 (string)
  //
  // reply(text) — 仍然可用
}`}</pre>
          </div>

          <div>
            <p className="font-medium mb-1">示例 1：飞书群机器人通知</p>
            <pre className="bg-card border rounded p-3 overflow-x-auto text-[10px]">{`// @name 飞书通知
// @description 将微信消息转发到飞书群机器人
// @author openilink
// @version 1.0.0
// @config webhook_url string "飞书 Webhook 地址"

function onRequest(ctx) {
  ctx.req.url = ctx.req.url; // 使用渠道配置的 URL
  ctx.req.body = JSON.stringify({
    msg_type: "text",
    content: {
      text: "[" + ctx.msg.msg_type + "] "
        + ctx.msg.sender + ": "
        + ctx.msg.content
    }
  });
}`}</pre>
          </div>

          <div>
            <p className="font-medium mb-1">示例 2：AI 自动回复（转发到 OpenAI）</p>
            <pre className="bg-card border rounded p-3 overflow-x-auto text-[10px]">{`// @name ChatGPT 回复
// @description 将消息转发到 OpenAI API 并自动回复
// @author openilink
// @version 1.0.0
// @config api_key string "OpenAI API Key"
// @config model string? "模型名称（默认 gpt-4o-mini）"

function onRequest(ctx) {
  ctx.req.url = "https://api.openai.com/v1/chat/completions";
  ctx.req.headers["Authorization"] = "Bearer YOUR_API_KEY";
  ctx.req.body = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "你是一个友好的助手" },
      { role: "user", content: ctx.msg.content }
    ]
  });
}

function onResponse(ctx) {
  var data = JSON.parse(ctx.res.body);
  if (data.choices && data.choices[0]) {
    reply(data.choices[0].message.content);
  }
}`}</pre>
          </div>

          <div>
            <p className="font-medium mb-1">示例 3：关键词过滤 + Slack 通知</p>
            <pre className="bg-card border rounded p-3 overflow-x-auto text-[10px]">{`// @name Slack 关键词通知
// @description 仅当消息包含关键词时转发到 Slack
// @author openilink
// @version 1.0.0
// @config keywords string "关键词（逗号分隔）"

function onRequest(ctx) {
  var keywords = ["紧急", "urgent", "bug"];
  var found = false;
  for (var i = 0; i < keywords.length; i++) {
    if (ctx.msg.content.indexOf(keywords[i]) >= 0) {
      found = true;
      break;
    }
  }
  if (!found) {
    skip(); // 不包含关键词，跳过
    return;
  }
  ctx.req.body = JSON.stringify({
    text: "⚠️ [" + ctx.msg.sender + "] " + ctx.msg.content
  });
}`}</pre>
          </div>

          <div>
            <p className="font-medium mb-1">安全说明</p>
            <ul className="text-muted-foreground space-y-1 list-disc pl-4">
              <li>脚本在安全沙箱中执行，无法访问文件系统、网络或系统 API</li>
              <li>执行超时 5 秒，超时自动终止</li>
              <li>禁止使用 eval() 和 Function 构造器</li>
              <li>reply() 每次最多调用 10 次</li>
              <li>HTTP 请求由 Hub 发出，已有 10 秒超时</li>
              <li>所有插件代码需通过管理员审核</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

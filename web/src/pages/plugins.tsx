import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { api } from "../lib/api";
import { Github, Download, Check, X, Trash2, Send } from "lucide-react";

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
    const u = await api.me();
    setUser(u);
    const status = tab === "review" ? "pending" : "approved";
    const list = await api.listPlugins(status);
    setPlugins(list || []);
  }

  useEffect(() => { load(); }, [tab]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">插件市场</h2>
        <div className="flex border rounded-lg overflow-hidden">
          <button className={`px-3 py-1 text-xs cursor-pointer ${tab === "marketplace" ? "bg-secondary" : "text-muted-foreground"}`} onClick={() => setTab("marketplace")}>市场</button>
          <button className={`px-3 py-1 text-xs cursor-pointer ${tab === "submit" ? "bg-secondary" : "text-muted-foreground"}`} onClick={() => setTab("submit")}>提交</button>
          {user?.role === "admin" && (
            <button className={`px-3 py-1 text-xs cursor-pointer ${tab === "review" ? "bg-secondary" : "text-muted-foreground"}`} onClick={() => setTab("review")}>审核</button>
          )}
        </div>
      </div>

      {tab === "marketplace" && (
        <div className="space-y-3">
          {plugins.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">暂无插件</p>}
          {plugins.map((p) => <PluginCard key={p.id} plugin={p} onRefresh={load} isAdmin={user?.role === "admin"} mode="marketplace" />)}
        </div>
      )}

      {tab === "submit" && <SubmitForm onSubmitted={() => { setTab("marketplace"); load(); }} />}

      {tab === "review" && (
        <div className="space-y-3">
          {plugins.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">没有待审核的插件</p>}
          {plugins.map((p) => <PluginCard key={p.id} plugin={p} onRefresh={load} isAdmin={true} mode="review" />)}
        </div>
      )}
    </div>
  );
}

function PluginCard({ plugin, onRefresh, isAdmin, mode }: { plugin: any; onRefresh: () => void; isAdmin: boolean; mode: string }) {
  const [detail, setDetail] = useState<any>(null);
  const [showScript, setShowScript] = useState(false);

  async function handleInstall() {
    const data = await api.installPlugin(plugin.id);
    await navigator.clipboard.writeText(data.script);
    alert("脚本已复制到剪贴板，请在渠道 Webhook 配置中粘贴使用。");
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

  async function handleViewScript() {
    if (!detail) {
      const d = await api.getPlugin(plugin.id);
      setDetail(d);
    }
    setShowScript(!showScript);
  }

  const s = statusMap[plugin.status] || statusMap.pending;
  const config = plugin.config_schema || [];

  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{plugin.name}</span>
            <Badge variant={s.variant} className="text-[10px]">{s.label}</Badge>
            <span className="text-[10px] text-muted-foreground">v{plugin.version}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{plugin.description}</p>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
            <span>by {plugin.author || "anonymous"}</span>
            {plugin.submitter_name && <span>提交者：{plugin.submitter_name}</span>}
            {plugin.reviewer_name && <span>审核：{plugin.reviewer_name}</span>}
            <span>{plugin.install_count} 次安装</span>
            {plugin.github_url && (
              <a href={plugin.github_url} target="_blank" rel="noopener" className="flex items-center gap-0.5 hover:text-primary">
                <Github className="w-3 h-3" /> 源码
              </a>
            )}
            {plugin.commit_hash && <span className="font-mono">{plugin.commit_hash.slice(0, 7)}</span>}
          </div>
          {plugin.reject_reason && (
            <p className="text-[10px] text-destructive mt-0.5">拒绝原因：{plugin.reject_reason}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {mode === "marketplace" && plugin.status === "approved" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleInstall}>
              <Download className="w-3 h-3 mr-1" /> 安装
            </Button>
          )}
          {mode === "review" && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleViewScript}>
                {showScript ? "收起" : "查看脚本"}
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
          配置项：{config.map((c: any) => `${c.name} (${c.type})`).join(", ")}
        </div>
      )}

      {showScript && detail?.script && (
        <pre className="text-[10px] bg-card border rounded p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">{detail.script}</pre>
      )}
    </Card>
  );
}

function SubmitForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await api.submitPlugin(url.trim());
      setUrl("");
      onSubmitted();
    } catch (err: any) {
      setError(err.message);
    }
    setSubmitting(false);
  }

  return (
    <Card className="space-y-3">
      <h3 className="text-sm font-medium">提交插件</h3>
      <p className="text-xs text-muted-foreground">
        将你的插件脚本托管在 GitHub，提交链接后由管理员审核。审核通过后会出现在插件市场。
      </p>
      <div className="p-3 rounded-lg border bg-card text-xs space-y-2">
        <p className="font-medium">插件格式要求：</p>
        <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap">{`// @name 插件名称
// @description 插件描述
// @author 作者
// @version 1.0.0
// @config webhook_url string "Webhook 地址"
// @config secret string? "签名密钥（可选）"

function onRequest(ctx) {
  // ctx.msg  — 消息内容
  // ctx.req  — HTTP 请求 {url, method, headers, body}
  // reply(text) — 回复消息
  // skip() — 跳过此 webhook
}

function onResponse(ctx) {
  // ctx.res — HTTP 响应 {status, headers, body}
}`}</pre>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/user/repo/blob/main/plugin.js"
          className="h-8 text-xs font-mono flex-1"
        />
        <Button type="submit" size="sm" disabled={submitting || !url.trim()}>
          <Send className="w-3.5 h-3.5 mr-1" /> {submitting ? "提交中..." : "提交"}
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[10px] text-muted-foreground">
        提交时会自动拉取脚本内容并固定 commit hash，确保审核的代码和实际运行的一致。
      </p>
    </Card>
  );
}

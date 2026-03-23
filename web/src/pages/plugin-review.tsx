import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { api } from "../lib/api";
import { Check, X, Trash2, Github, Shield } from "lucide-react";

export function ReviewCard({ plugin, onRefresh }: { plugin: any; onRefresh: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  useEffect(() => {
    api.getPlugin(plugin.id).then(setDetail).catch(() => {});
  }, [plugin.id]);

  async function handleApprove() {
    await api.reviewPlugin(plugin.id, "approved");
    onRefresh();
  }
  async function handleReject() {
    if (!rejectReason.trim()) return;
    await api.reviewPlugin(plugin.id, "rejected", rejectReason.trim());
    onRefresh();
  }
  async function handleDelete() {
    if (!confirm("永久删除此插件？")) return;
    await api.deletePlugin(plugin.id);
    onRefresh();
  }

  const grants = (plugin.grant_perms || "").split(",").filter(Boolean);
  const matchTypes = plugin.match_types || "*";
  const connectDomains = plugin.connect_domains || "*";
  const hasReply = grants.includes("reply");
  const hasSkip = grants.includes("skip");
  const isGrantNone = grants.includes("none");
  const wildcardConnect = connectDomains === "*";
  const wildcardMatch = matchTypes === "*";

  const risks: { level: "ok" | "warn" | "danger"; text: string }[] = [];
  if (isGrantNone) risks.push({ level: "ok", text: "声明 @grant none — 无副作用" });
  else if (grants.length === 0) risks.push({ level: "warn", text: "未声明 @grant — 默认全部 API 可用" });
  if (hasReply) risks.push({ level: "warn", text: "使用 reply() — 可向用户发送消息" });
  if (hasSkip) risks.push({ level: "ok", text: "使用 skip() — 可跳过 webhook 推送" });
  if (wildcardConnect) risks.push({ level: "danger", text: "@connect * — 可将请求重定向到任意域名" });
  else if (connectDomains) risks.push({ level: "ok", text: `@connect 限定域名: ${connectDomains}` });
  if (wildcardMatch) risks.push({ level: "ok", text: "@match * — 所有消息类型触发" });
  else risks.push({ level: "ok", text: `@match 限定类型: ${matchTypes}` });

  // Check script for suspicious patterns
  const scriptText = detail?.script || "";
  if (scriptText.includes("while(true)") || scriptText.includes("for(;;)")) risks.push({ level: "danger", text: "检测到疑似死循环" });
  if (scriptText.includes("__proto__") || scriptText.includes("prototype")) risks.push({ level: "warn", text: "检测到原型链操作" });
  if ((scriptText.match(/reply\(/g) || []).length > 3) risks.push({ level: "warn", text: `多处 reply() 调用 (${(scriptText.match(/reply\(/g) || []).length} 处)` });

  const riskColors = { ok: "text-primary", warn: "text-yellow-500", danger: "text-destructive" };
  const riskIcons = { ok: "✓", warn: "⚠", danger: "✕" };
  const overallRisk = risks.some(r => r.level === "danger") ? "danger" : risks.some(r => r.level === "warn") ? "warn" : "ok";
  const overallLabels = { ok: "低风险", warn: "需注意", danger: "高风险" };
  const overallColors = { ok: "border-primary/30 bg-primary/5", warn: "border-yellow-500/30 bg-yellow-500/5", danger: "border-destructive/30 bg-destructive/5" };

  return (
    <div className={`rounded-xl border-2 ${overallColors[overallRisk]} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {plugin.icon && <span className="text-lg">{plugin.icon}</span>}
            <span className="font-semibold text-sm">{plugin.name}</span>
            <span className="text-[10px] text-muted-foreground">v{plugin.version}</span>
            {plugin.namespace && <span className="text-[10px] font-mono text-muted-foreground">{plugin.namespace}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{plugin.description}</p>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
            <span>作者: {plugin.author || "anonymous"}</span>
            <span>拥有者: {plugin.submitter_name}</span>
            {plugin.license && <span>{plugin.license}</span>}
            {plugin.github_url && (
              <a href={plugin.github_url} target="_blank" rel="noopener" className="text-primary hover:underline flex items-center gap-0.5">
                <Github className="w-3 h-3" /> GitHub
              </a>
            )}
            {plugin.commit_hash && <span className="font-mono">{plugin.commit_hash.slice(0, 7)}</span>}
          </div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${riskColors[overallRisk]}`}>
          <Shield className="w-3.5 h-3.5 inline mr-0.5" />
          {overallLabels[overallRisk]}
        </div>
      </div>

      {/* Security analysis */}
      <div className="rounded-lg border bg-card p-3 space-y-1.5">
        <p className="text-xs font-medium flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> 安全分析</p>
        {risks.map((r, i) => (
          <div key={i} className={`text-[11px] flex items-start gap-1.5 ${riskColors[r.level]}`}>
            <span className="shrink-0">{riskIcons[r.level]}</span>
            <span>{r.text}</span>
          </div>
        ))}
      </div>

      {/* Config schema */}
      {(plugin.config_schema || []).length > 0 && (
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs font-medium mb-1">配置参数</p>
          <div className="space-y-1">
            {(plugin.config_schema || []).map((c: any, i: number) => (
              <div key={i} className="text-[11px] flex items-center gap-2">
                <code className="font-mono bg-background px-1 rounded">{c.name}</code>
                <span className="text-muted-foreground">{c.type}</span>
                {c.description && <span className="text-muted-foreground">— {c.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source code */}
      <div className="rounded-lg border bg-card">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <p className="text-xs font-medium">源码</p>
          <span className="text-[10px] text-muted-foreground">{scriptText.split("\n").length} 行</span>
        </div>
        <pre className="p-3 text-[10px] font-mono overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap">
          {scriptText || "加载中..."}
        </pre>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {!showReject ? (
          <>
            <Button size="sm" onClick={handleApprove} className="flex-1">
              <Check className="w-3.5 h-3.5 mr-1" /> 通过审核
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowReject(true)} className="flex-1">
              <X className="w-3.5 h-3.5 mr-1" /> 拒绝
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </>
        ) : (
          <div className="flex-1 space-y-2">
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请输入拒绝原因..." className="h-8 text-xs" autoFocus />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleReject} disabled={!rejectReason.trim()} className="flex-1">
                确认拒绝
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowReject(false); setRejectReason(""); }}>
                取消
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

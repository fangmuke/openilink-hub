import { useEffect, useState } from "react";
import { ArrowLeft, Trash2, Copy, Check, Eye, EyeOff, RefreshCw, ShieldCheck, ExternalLink } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { api } from "../lib/api";

// ==================== Installation Detail ====================

export function InstallationDetail({ appId, installation, onBack }: { appId: string; installation: any; onBack: () => void }) {
  const [ins, setIns] = useState(installation);
  const [tab, setTab] = useState<"detail" | "event-logs" | "api-logs">("detail");

  async function reload() {
    try { setIns(await api.getInstallation(appId, ins.id)); } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground cursor-pointer">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h3 className="text-sm font-medium">安装详情 - {ins.bot_name || ins.bot_id}</h3>
      </div>

      <div className="flex rounded-lg border overflow-hidden w-fit">
        <button className={`px-3 py-1.5 text-xs cursor-pointer ${tab === "detail" ? "bg-secondary font-medium" : "text-muted-foreground"}`} onClick={() => setTab("detail")}>配置</button>
        <button className={`px-3 py-1.5 text-xs cursor-pointer ${tab === "event-logs" ? "bg-secondary font-medium" : "text-muted-foreground"}`} onClick={() => setTab("event-logs")}>事件日志</button>
        <button className={`px-3 py-1.5 text-xs cursor-pointer ${tab === "api-logs" ? "bg-secondary font-medium" : "text-muted-foreground"}`} onClick={() => setTab("api-logs")}>API 日志</button>
      </div>

      {tab === "detail" ? (
        <InstallationConfig appId={appId} installation={ins} onUpdate={reload} onBack={onBack} />
      ) : tab === "event-logs" ? (
        <LogsView appId={appId} installationId={ins.id} type="event" />
      ) : (
        <LogsView appId={appId} installationId={ins.id} type="api" />
      )}
    </div>
  );
}

// ==================== Installation Config ====================

function InstallationConfig({ appId, installation, onUpdate, onBack }: { appId: string; installation: any; onUpdate: () => void; onBack: () => void }) {
  const [requestUrl, setRequestUrl] = useState(installation.request_url || "");
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateInstallation(appId, installation.id, { request_url: requestUrl, enabled: installation.enabled });
      onUpdate();
    } catch {}
    setSaving(false);
  }

  async function handleToggle() {
    try {
      await api.updateInstallation(appId, installation.id, { enabled: !installation.enabled });
      onUpdate();
    } catch {}
  }

  async function handleVerify() {
    setVerifying(true); setVerifyResult("");
    try {
      const res = await api.verifyUrl(appId, installation.id);
      setVerifyResult(res.success ? "验证成功" : "验证失败: " + (res.error || ""));
      onUpdate();
    } catch (err: any) { setVerifyResult("验证失败: " + err.message); }
    setVerifying(false);
  }

  async function handleRegenerate() {
    if (!confirm("重新生成 Token 后，旧 Token 将立即失效。")) return;
    setRegenerating(true);
    try { await api.regenerateToken(appId, installation.id); onUpdate(); } catch {}
    setRegenerating(false);
  }

  async function handleDelete() {
    if (!confirm("确定卸载此安装？")) return;
    try { await api.deleteInstallation(appId, installation.id); onBack(); } catch {}
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h3 className="text-sm font-medium">凭证</h3>
        <SecretField label="App Token" value={installation.app_token || ""} />
        <SecretField label="Signing Secret" value={installation.signing_secret || ""} />
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleRegenerate} disabled={regenerating}>
          <RefreshCw className="w-3 h-3 mr-1" /> {regenerating ? "..." : "重新生成 Token"}
        </Button>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-medium">请求 URL</h3>
        <p className="text-xs text-muted-foreground">事件将被发送到此 URL</p>
        <div className="flex gap-2">
          <Input
            placeholder="https://your-server.com/events"
            value={requestUrl}
            onChange={(e) => setRequestUrl(e.target.value)}
            className="h-8 text-xs flex-1"
          />
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "..." : "保存"}</Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleVerify} disabled={verifying}>
            <ExternalLink className="w-3 h-3 mr-1" /> {verifying ? "..." : "验证 URL"}
          </Button>
          {verifyResult && (
            <span className={`text-[10px] ${verifyResult.includes("成功") ? "text-primary" : "text-destructive"}`}>
              {verifyResult}
            </span>
          )}
          {installation.url_verified && (
            <Badge variant="default"><ShieldCheck className="w-3 h-3 mr-1" /> 已验证</Badge>
          )}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">状态</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={installation.enabled} onChange={handleToggle} className="w-3.5 h-3.5 accent-primary" />
            <span className="text-xs">{installation.enabled ? "已启用" : "已禁用"}</span>
          </label>
        </div>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-medium text-destructive">危险区域</h3>
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          <Trash2 className="w-3.5 h-3.5 mr-1" /> 卸载
        </Button>
      </Card>
    </div>
  );
}

// ==================== Secret Field ====================

function SecretField({ label, value }: { label: string; value: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const masked = value ? value.slice(0, 6) + "..." + value.slice(-4) : "---";

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 p-2 rounded-lg border bg-background">
        <code className="text-xs font-mono flex-1 break-all">{show ? value : masked}</code>
        <button onClick={() => setShow(!show)} className="cursor-pointer text-muted-foreground hover:text-foreground">
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
        <button onClick={handleCopy} className="cursor-pointer text-muted-foreground hover:text-foreground">
          {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ==================== Logs View ====================

function LogsView({ appId, installationId, type }: { appId: string; installationId: string; type: "event" | "api" }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fn = type === "event" ? api.listEventLogs : api.listApiLogs;
    fn(appId, installationId).then((l) => setLogs(l || [])).catch(() => {}).finally(() => setLoading(false));
  }, [appId, installationId, type]);

  if (loading) return <p className="text-xs text-muted-foreground">加载中...</p>;

  if (logs.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-4">暂无{type === "event" ? "事件" : "API"}日志</p>;
  }

  return (
    <div className="space-y-2">
      {type === "event" ? (
        <div className="text-[10px] text-muted-foreground grid grid-cols-5 gap-2 px-2 font-medium">
          <span>事件</span><span>状态</span><span>Trace ID</span><span>耗时</span><span>时间</span>
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground grid grid-cols-5 gap-2 px-2 font-medium">
          <span>方法</span><span>路径</span><span>状态</span><span>耗时</span><span>时间</span>
        </div>
      )}
      {logs.map((log, i) => (
        <div key={log.id || i} className="grid grid-cols-5 gap-2 px-2 py-1.5 rounded-lg border bg-background text-xs">
          {type === "event" ? (
            <>
              <span className="font-mono truncate">{log.event_type || log.event}</span>
              <Badge variant={log.status === "success" || log.status_code < 300 ? "default" : "destructive"} className="w-fit">
                {log.status || log.status_code}
              </Badge>
              <span className="font-mono truncate text-[10px]">{log.trace_id || "---"}</span>
              <span className="text-muted-foreground">{log.duration_ms != null ? `${log.duration_ms}ms` : "---"}</span>
              <span className="text-muted-foreground text-[10px]">{log.created_at ? new Date(log.created_at * 1000).toLocaleString() : "---"}</span>
            </>
          ) : (
            <>
              <span className="font-mono">{log.method}</span>
              <span className="font-mono truncate text-[10px]">{log.path}</span>
              <Badge variant={log.status_code < 300 ? "default" : "destructive"} className="w-fit">
                {log.status_code}
              </Badge>
              <span className="text-muted-foreground">{log.duration_ms != null ? `${log.duration_ms}ms` : "---"}</span>
              <span className="text-muted-foreground text-[10px]">{log.created_at ? new Date(log.created_at * 1000).toLocaleString() : "---"}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

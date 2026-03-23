import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Blocks, Plus, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { api } from "../lib/api";
import { InstallationDetail } from "./app-installation";

const EVENT_TYPES = [
  { key: "message.text", label: "文本消息" },
  { key: "message.image", label: "图片消息" },
  { key: "message.video", label: "视频消息" },
  { key: "message.voice", label: "语音消息" },
  { key: "message.file", label: "文件消息" },
  { key: "message.location", label: "位置消息" },
  { key: "contact.added", label: "新增联系人" },
  { key: "group.join", label: "入群" },
  { key: "group.leave", label: "退群" },
];

const SCOPES = [
  { key: "messages.send", label: "发送消息" },
  { key: "messages.read", label: "读取消息" },
  { key: "contacts.read", label: "读取联系人" },
  { key: "bot.read", label: "读取 Bot 信息" },
];

export function AppDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState<any>(null);
  const [tab, setTab] = useState<"settings" | "installations" | "events">("settings");

  async function loadApp() {
    try {
      const a = await api.getApp(id!);
      setApp(a);
    } catch { navigate("/dashboard/apps"); }
  }

  useEffect(() => { loadApp(); }, [id]);

  if (!app) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/dashboard/apps" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        {app.icon ? (
          <img src={app.icon} alt="" className="w-8 h-8 rounded-lg object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
            <Blocks className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold">{app.name}</h1>
          <p className="text-xs text-muted-foreground font-mono">{app.slug}</p>
        </div>
        <Badge variant={app.status === "active" ? "default" : "outline"}>
          {app.status === "active" ? "启用" : app.status || "草稿"}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg border overflow-hidden w-fit">
        <button className={`px-3 py-1.5 text-xs cursor-pointer ${tab === "settings" ? "bg-secondary font-medium" : "text-muted-foreground"}`} onClick={() => setTab("settings")}>设置</button>
        <button className={`px-3 py-1.5 text-xs cursor-pointer ${tab === "installations" ? "bg-secondary font-medium" : "text-muted-foreground"}`} onClick={() => setTab("installations")}>安装</button>
        <button className={`px-3 py-1.5 text-xs cursor-pointer ${tab === "events" ? "bg-secondary font-medium" : "text-muted-foreground"}`} onClick={() => setTab("events")}>事件与权限</button>
      </div>

      {tab === "settings" ? (
        <SettingsTab app={app} onUpdate={loadApp} />
      ) : tab === "installations" ? (
        <InstallationsTab appId={id!} />
      ) : (
        <EventsScopesTab app={app} onUpdate={loadApp} />
      )}
    </div>
  );
}

// ==================== Settings Tab ====================

function SettingsTab({ app, onUpdate }: { app: any; onUpdate: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: app.name || "", description: app.description || "",
    icon: app.icon || "", homepage: app.homepage || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSuccess("");
    setSaving(true);
    try {
      await api.updateApp(app.id, form);
      setSuccess("已保存");
      onUpdate();
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("确定删除此 App？所有安装也将被移除。")) return;
    try { await api.deleteApp(app.id); navigate("/dashboard/apps"); } catch {}
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h3 className="text-sm font-medium">基本信息</h3>
        <form onSubmit={handleSave} className="space-y-2">
          <Input placeholder="名称" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-8 text-xs" />
          <Input placeholder="描述" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="h-8 text-xs" />
          <Input placeholder="图标 URL" value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} className="h-8 text-xs" />
          <Input placeholder="主页 URL" value={form.homepage} onChange={(e) => setForm((f) => ({ ...f, homepage: e.target.value }))} className="h-8 text-xs" />
          <div className="flex items-center justify-between">
            <div>
              {error && <span className="text-[10px] text-destructive">{error}</span>}
              {success && <span className="text-[10px] text-primary">{success}</span>}
            </div>
            <Button type="submit" size="sm" disabled={saving}>{saving ? "..." : "保存"}</Button>
          </div>
        </form>
      </Card>

      <CommandsEditor app={app} onUpdate={onUpdate} />

      <Card className="space-y-3">
        <h3 className="text-sm font-medium text-destructive">危险区域</h3>
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          <Trash2 className="w-3.5 h-3.5 mr-1" /> 删除 App
        </Button>
      </Card>
    </div>
  );
}

// ==================== Commands Editor ====================

function CommandsEditor({ app, onUpdate }: { app: any; onUpdate: () => void }) {
  const [commands, setCommands] = useState<{ name: string; description: string; usage: string }[]>(
    app.commands || []
  );
  const [saving, setSaving] = useState(false);

  function addCommand() {
    setCommands([...commands, { name: "", description: "", usage: "" }]);
  }

  function removeCommand(index: number) {
    setCommands(commands.filter((_, i) => i !== index));
  }

  function updateCommand(index: number, field: string, value: string) {
    setCommands(commands.map((c, i) => i === index ? { ...c, [field]: value } : c));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateApp(app.id, { commands });
      onUpdate();
    } catch {}
    setSaving(false);
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">命令</h3>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addCommand}>
          <Plus className="w-3 h-3 mr-1" /> 添加命令
        </Button>
      </div>
      {commands.length === 0 && (
        <p className="text-[10px] text-muted-foreground">暂无命令</p>
      )}
      {commands.map((cmd, i) => (
        <div key={i} className="flex items-start gap-2 p-2 rounded-lg border bg-background">
          <div className="flex-1 space-y-1">
            <Input placeholder="/命令名" value={cmd.name} onChange={(e) => updateCommand(i, "name", e.target.value)} className="h-7 text-xs font-mono" />
            <Input placeholder="描述" value={cmd.description} onChange={(e) => updateCommand(i, "description", e.target.value)} className="h-7 text-xs" />
            <Input placeholder="用法示例" value={cmd.usage} onChange={(e) => updateCommand(i, "usage", e.target.value)} className="h-7 text-xs" />
          </div>
          <button onClick={() => removeCommand(i)} className="cursor-pointer mt-1">
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </button>
        </div>
      ))}
      {commands.length > 0 && (
        <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "..." : "保存命令"}</Button>
      )}
    </Card>
  );
}

// ==================== Events & Scopes Tab ====================

function EventsScopesTab({ app, onUpdate }: { app: any; onUpdate: () => void }) {
  const [events, setEvents] = useState<string[]>(app.events || []);
  const [scopes, setScopes] = useState<string[]>(app.scopes || []);
  const [saving, setSaving] = useState(false);

  function toggleEvent(key: string) {
    setEvents((prev) => prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]);
  }
  function toggleScope(key: string) {
    setScopes((prev) => prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]);
  }

  async function handleSave() {
    setSaving(true);
    try { await api.updateApp(app.id, { events, scopes }); onUpdate(); } catch {}
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h3 className="text-sm font-medium">订阅事件</h3>
        <p className="text-xs text-muted-foreground">选择你的 App 需要接收的事件类型</p>
        <div className="grid grid-cols-2 gap-2">
          {EVENT_TYPES.map((et) => (
            <label key={et.key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={events.includes(et.key)} onChange={() => toggleEvent(et.key)} className="w-3.5 h-3.5 accent-primary" />
              <span className="text-xs">{et.label}</span>
              <span className="text-[10px] text-muted-foreground font-mono">{et.key}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-medium">权限范围</h3>
        <p className="text-xs text-muted-foreground">选择你的 App 需要的 API 权限</p>
        <div className="grid grid-cols-2 gap-2">
          {SCOPES.map((s) => (
            <label key={s.key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={scopes.includes(s.key)} onChange={() => toggleScope(s.key)} className="w-3.5 h-3.5 accent-primary" />
              <span className="text-xs">{s.label}</span>
              <span className="text-[10px] text-muted-foreground font-mono">{s.key}</span>
            </label>
          ))}
        </div>
      </Card>

      <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "..." : "保存"}</Button>
    </div>
  );
}

// ==================== Installations Tab ====================

function InstallationsTab({ appId }: { appId: string }) {
  const [installations, setInstallations] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [installing, setInstalling] = useState(false);
  const [selectedBot, setSelectedBot] = useState("");
  const [detail, setDetail] = useState<any>(null);

  async function load() {
    try {
      const [ins, bs] = await Promise.all([api.listInstallations(appId), api.listBots()]);
      setInstallations(ins || []);
      setBots(bs || []);
    } catch {}
  }

  useEffect(() => { load(); }, [appId]);

  async function handleInstall() {
    if (!selectedBot) return;
    try {
      await api.installApp(appId, { bot_id: selectedBot });
      setInstalling(false);
      setSelectedBot("");
      load();
    } catch {}
  }

  if (detail) {
    return <InstallationDetail appId={appId} installation={detail} onBack={() => { setDetail(null); load(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">已安装</h3>
        {!installing && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setInstalling(true)}>
            <Plus className="w-3 h-3 mr-1" /> 安装到 Bot
          </Button>
        )}
      </div>

      {installing && (
        <Card className="space-y-3">
          <h3 className="text-sm font-medium">选择 Bot</h3>
          <select
            value={selectedBot}
            onChange={(e) => setSelectedBot(e.target.value)}
            className="w-full h-8 text-xs rounded-md border bg-background px-2"
          >
            <option value="">选择一个 Bot...</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleInstall} disabled={!selectedBot}>安装</Button>
            <Button variant="ghost" size="sm" onClick={() => setInstalling(false)}>取消</Button>
          </div>
        </Card>
      )}

      {installations.map((ins) => (
        <Card
          key={ins.id}
          className="flex items-center justify-between cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setDetail(ins)}
        >
          <div>
            <p className="text-sm font-medium">{ins.bot_name || ins.bot_id}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{ins.id}</p>
          </div>
          <div className="flex items-center gap-2">
            {ins.url_verified && (
              <Badge variant="default">
                <ShieldCheck className="w-3 h-3 mr-1" /> URL 已验证
              </Badge>
            )}
            <Badge variant={ins.enabled ? "default" : "outline"}>
              {ins.enabled ? "启用" : "禁用"}
            </Badge>
          </div>
        </Card>
      ))}

      {installations.length === 0 && !installing && (
        <p className="text-center text-sm text-muted-foreground py-4">暂无安装</p>
      )}
    </div>
  );
}


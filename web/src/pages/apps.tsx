import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Plus, Blocks, X } from "lucide-react";
import { api } from "../lib/api";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function AppsPage() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", description: "", icon: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const list = await api.listApps();
      setApps(list || []);
    } catch {}
  }

  useEffect(() => { load(); }, []);

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, name, slug: slugify(name) }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) { setError("名称不能为空"); return; }
    if (!form.slug.trim()) { setError("Slug 不能为空"); return; }
    setSaving(true);
    try {
      await api.createApp(form);
      setForm({ name: "", slug: "", description: "", icon: "" });
      setCreating(false);
      load();
    } catch (err: any) {
      setError(err.message);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">App 管理</h1>
          <p className="text-xs text-muted-foreground mt-0.5">创建和管理你的 App，安装到 Bot 上使用</p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)} variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-1" /> 创建 App
          </Button>
        )}
      </div>

      {creating && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">创建新 App</h3>
            <button onClick={() => { setCreating(false); setError(""); }} className="cursor-pointer">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-2">
            <Input
              placeholder="App 名称"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="h-8 text-xs"
            />
            <Input
              placeholder="Slug（URL 标识符）"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              className="h-8 text-xs font-mono"
            />
            <Input
              placeholder="描述（可选）"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="h-8 text-xs"
            />
            <Input
              placeholder="图标 URL（可选）"
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              className="h-8 text-xs"
            />
            <div className="flex items-center justify-between">
              <div>
                {error && <span className="text-[10px] text-destructive">{error}</span>}
              </div>
              <Button type="submit" size="sm" disabled={saving}>{saving ? "..." : "创建"}</Button>
            </div>
          </form>
        </Card>
      )}

      {apps.map((app) => (
        <Card
          key={app.id}
          className="flex items-center justify-between cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate(`/dashboard/apps/${app.id}`)}
        >
          <div className="flex items-center gap-3">
            {app.icon ? (
              <img src={app.icon} alt="" className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                <Blocks className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            <div>
              <p className="font-medium text-sm">{app.name}</p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{app.slug}</p>
              {app.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{app.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {app.commands?.length > 0 && (
              <span className="text-[10px] text-muted-foreground">{app.commands.length} 个命令</span>
            )}
            <Badge variant={app.status === "active" ? "default" : "outline"}>
              {app.status === "active" ? "启用" : app.status || "草稿"}
            </Badge>
          </div>
        </Card>
      ))}

      {apps.length === 0 && !creating && (
        <p className="text-center text-sm text-muted-foreground py-8">点击上方按钮创建你的第一个 App</p>
      )}
    </div>
  );
}

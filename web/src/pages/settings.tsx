import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { api } from "../lib/api";
import { Link2, Unlink, Save, Trash2, KeyRound, Plus } from "lucide-react";

const providerLabels: Record<string, string> = {
  github: "GitHub",
  linuxdo: "LinuxDo",
};

const providerCallbackHelp: Record<string, string> = {
  github: "在 github.com/settings/developers → OAuth Apps 中创建应用",
  linuxdo: "在 connect.linux.do 中创建应用",
};

export function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [oauthAccounts, setOauthAccounts] = useState<any[]>([]);
  const [oauthProviders, setOauthProviders] = useState<string[]>([]);

  async function load() {
    const [u, accounts, providers] = await Promise.all([
      api.me(),
      api.oauthAccounts(),
      api.oauthProviders(),
    ]);
    setUser(u);
    setOauthAccounts(accounts || []);
    setOauthProviders(providers.providers || []);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_bound") || params.get("oauth_error")) {
      window.history.replaceState({}, "", "/settings");
      load();
    }
  }, []);

  async function handleUnlink(provider: string) {
    if (!confirm(`确认解绑 ${providerLabels[provider] || provider}？`)) return;
    try {
      await api.unlinkOAuth(provider);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  function handleBind(provider: string) {
    window.location.href = `/api/me/linked-accounts/${provider}/bind`;
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">设置</h1>
        <p className="text-xs text-muted-foreground mt-0.5">账号信息、系统配置</p>
      </div>

      <Card className="space-y-3">
        <h3 className="text-sm font-medium">账号信息</h3>
        <div className="text-sm space-y-1">
          <p><span className="text-muted-foreground">用户名：</span>{user.username}</p>
          <p><span className="text-muted-foreground">显示名：</span>{user.display_name}</p>
          <p><span className="text-muted-foreground">角色：</span>{user.role}</p>
        </div>
      </Card>

      {oauthProviders.length > 0 && (
        <Card className="space-y-3">
          <h3 className="text-sm font-medium">第三方账号绑定</h3>
          <div className="space-y-2">
            {oauthProviders.map((provider) => {
              const account = oauthAccounts.find((a) => a.provider === provider);
              const linked = !!account;
              return (
                <div key={provider} className="flex items-center justify-between p-3 rounded-lg border bg-background">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                      <span className="text-xs font-medium">
                        {(providerLabels[provider] || provider).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{providerLabels[provider] || provider}</p>
                      <p className="text-xs text-muted-foreground">
                        {linked ? `已绑定：${account.username}` : "未绑定"}
                      </p>
                    </div>
                  </div>
                  {linked ? (
                    <Button variant="ghost" size="sm" onClick={() => handleUnlink(provider)}>
                      <Unlink className="w-3.5 h-3.5 mr-1" /> 解绑
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => handleBind(provider)}>
                      <Link2 className="w-3.5 h-3.5 mr-1" /> 绑定
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <ChangePasswordSection />
      <PasskeySection />

      {user.role === "admin" && <AdminDashboard />}
      {user.role === "admin" && <UserManagementSection />}
      {user.role === "admin" && <SystemStatusSection />}
      {user.role === "admin" && <AIConfigSection />}
      {user.role === "admin" && <OAuthConfigSection />}
    </div>
  );
}

function PasskeySection() {
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try { setPasskeys(await api.listPasskeys() || []); } catch {}
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    setAdding(true);
    setError("");
    try {
      // Step 1: Get registration options from server
      const options = await api.passkeyBindBegin();

      // Step 2: Convert base64url fields for WebAuthn API
      options.publicKey.challenge = base64urlToBuffer(options.publicKey.challenge);
      options.publicKey.user.id = base64urlToBuffer(options.publicKey.user.id);
      if (options.publicKey.excludeCredentials) {
        options.publicKey.excludeCredentials = options.publicKey.excludeCredentials.map((c: any) => ({
          ...c, id: base64urlToBuffer(c.id),
        }));
      }

      // Step 3: Create credential via browser
      const credential = await navigator.credentials.create(options) as PublicKeyCredential;
      if (!credential) throw new Error("cancelled");

      const response = credential.response as AuthenticatorAttestationResponse;

      // Step 4: Send to server
      const body = JSON.stringify({
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          attestationObject: bufferToBase64url(response.attestationObject),
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
        },
      });

      await api.passkeyBindFinishRaw(body);
      load();
    } catch (err: any) {
      if (err.name !== "NotAllowedError") setError(err.message || "注册失败");
    }
    setAdding(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("删除此 Passkey？")) return;
    try { await api.deletePasskey(id); load(); } catch (err: any) { setError(err.message); }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Passkey</h3>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleAdd} disabled={adding}>
          <Plus className="w-3 h-3 mr-1" /> {adding ? "注册中..." : "添加 Passkey"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        使用指纹、Face ID 或安全密钥登录，无需密码。
      </p>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
      {passkeys.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">暂未绑定任何 Passkey</p>
      ) : (
        <div className="space-y-1">
          {passkeys.map((pk) => (
            <div key={pk.id} className="flex items-center justify-between p-2 rounded-lg border bg-background">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-mono">{pk.id.slice(0, 16)}...</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(pk.created_at * 1000).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-6" onClick={() => handleDelete(pk.id)}>
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// WebAuthn helpers
function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function ChangePasswordSection() {
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (newPwd.length < 8) { setError("新密码至少 8 位"); return; }
    if (newPwd !== confirmPwd) { setError("两次输入不一致"); return; }
    setSaving(true);
    try {
      await api.changePassword({ old_password: oldPwd, new_password: newPwd });
      setOldPwd(""); setNewPwd(""); setConfirmPwd("");
      setSuccess("密码已修改");
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  }

  return (
    <Card className="space-y-3">
      <h3 className="text-sm font-medium">修改密码</h3>
      <form onSubmit={handleSubmit} className="space-y-2">
        <Input type="password" placeholder="当前密码" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} className="h-8 text-xs" />
        <Input type="password" placeholder="新密码（至少 8 位）" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="h-8 text-xs" />
        <Input type="password" placeholder="确认新密码" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} className="h-8 text-xs" />
        <div className="flex items-center justify-between">
          <div>
            {error && <span className="text-[10px] text-destructive">{error}</span>}
            {success && <span className="text-[10px] text-primary">{success}</span>}
          </div>
          <Button type="submit" size="sm" disabled={saving}>{saving ? "..." : "修改密码"}</Button>
        </div>
      </form>
    </Card>
  );
}

function UserManagementSection() {
  const [users, setUsers] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [error, setError] = useState("");
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState("");

  async function load() {
    try { setUsers(await api.listUsers() || []); } catch {}
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!newUsername.trim() || newPassword.length < 8) { setError("用户名必填，密码至少 8 位"); return; }
    try {
      await api.createUser({ username: newUsername.trim(), password: newPassword, role: newRole });
      setNewUsername(""); setNewPassword(""); setShowCreate(false);
      load();
    } catch (err: any) { setError(err.message); }
  }

  async function handleToggleRole(user: any) {
    const newRole = user.role === "admin" ? "member" : "admin";
    if (!confirm(`将 ${user.username} 的角色改为 ${newRole === "admin" ? "管理员" : "成员"}？`)) return;
    try { await api.updateUserRole(user.id, newRole); load(); } catch (err: any) { setError(err.message); }
  }

  async function handleToggleStatus(user: any) {
    const newStatus = user.status === "active" ? "disabled" : "active";
    if (!confirm(`${newStatus === "disabled" ? "禁用" : "启用"} 用户 ${user.username}？`)) return;
    try { await api.updateUserStatus(user.id, newStatus); load(); } catch (err: any) { setError(err.message); }
  }

  async function handleResetPassword() {
    if (!resetTarget || resetPwd.length < 8) { setError("密码至少 8 位"); return; }
    try {
      await api.resetUserPassword(resetTarget, resetPwd);
      setResetTarget(null); setResetPwd("");
      setError("");
    } catch (err: any) { setError(err.message); }
  }

  async function handleDelete(user: any) {
    if (!confirm(`永久删除用户 ${user.username}？此操作不可撤销。`)) return;
    try { await api.deleteUser(user.id); load(); } catch (err: any) { setError(err.message); }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">用户管理</h3>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "取消" : "创建用户"}
        </Button>
      </div>

      {error && <p className="text-[10px] text-destructive">{error}</p>}

      {showCreate && (
        <form onSubmit={handleCreate} className="p-3 rounded-lg border bg-background space-y-2">
          <div className="flex gap-2">
            <Input placeholder="用户名" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="h-7 text-xs" />
            <Input type="password" placeholder="密码（至少 8 位）" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-7 text-xs" />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {["member", "admin"].map((r) => (
                <button key={r} type="button" onClick={() => setNewRole(r)}
                  className={`px-2 py-0.5 text-[10px] rounded cursor-pointer ${newRole === r ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                  {r === "admin" ? "管理员" : "成员"}
                </button>
              ))}
            </div>
            <Button type="submit" size="sm" className="h-7 text-xs">创建</Button>
          </div>
        </form>
      )}

      <div className="space-y-1">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between p-2 rounded-lg border bg-background">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-medium">
                {u.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{u.username}</span>
                  <span className={`text-[10px] px-1 rounded ${u.role === "admin" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                    {u.role === "admin" ? "管理员" : "成员"}
                  </span>
                  {u.status === "disabled" && (
                    <span className="text-[10px] px-1 rounded bg-destructive/10 text-destructive">已禁用</span>
                  )}
                </div>
                {u.email && <p className="text-[10px] text-muted-foreground">{u.email}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => handleToggleRole(u)} className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-secondary cursor-pointer">
                {u.role === "admin" ? "降级" : "升级"}
              </button>
              <button onClick={() => handleToggleStatus(u)} className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-secondary cursor-pointer">
                {u.status === "active" ? "禁用" : "启用"}
              </button>
              <button onClick={() => { setResetTarget(u.id); setResetPwd(""); }} className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-secondary cursor-pointer">
                重置密码
              </button>
              <button onClick={() => handleDelete(u)} className="text-[10px] text-destructive hover:text-destructive/80 px-1.5 py-0.5 rounded hover:bg-destructive/10 cursor-pointer">
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Reset password dialog */}
      {resetTarget && (
        <div className="p-3 rounded-lg border bg-background space-y-2">
          <p className="text-xs font-medium">重置密码 — {users.find((u) => u.id === resetTarget)?.username}</p>
          <div className="flex gap-2">
            <Input type="password" placeholder="新密码（至少 8 位）" value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} className="h-7 text-xs" autoFocus />
            <Button size="sm" className="h-7 text-xs" onClick={handleResetPassword}>确认</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setResetTarget(null)}>取消</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.adminStats().then(setStats).catch(() => {});
    const t = setInterval(() => api.adminStats().then(setStats).catch(() => {}), 10000);
    return () => clearInterval(t);
  }, []);

  if (!stats) return null;

  const items = [
    { label: "用户", value: stats.total_users, sub: `${stats.active_users} 活跃` },
    { label: "Bot", value: stats.total_bots, sub: `${stats.online_bots} 在线${stats.expired_bots > 0 ? ` / ${stats.expired_bots} 过期` : ""}` },
    { label: "渠道", value: stats.total_channels },
    { label: "WebSocket", value: stats.connected_ws, sub: "在线连接" },
    { label: "总消息", value: stats.total_messages.toLocaleString(), sub: `${stats.inbound_messages.toLocaleString()} 入 / ${stats.outbound_messages.toLocaleString()} 出` },
  ];

  return (
    <Card className="space-y-3">
      <h3 className="text-sm font-medium">管理面板</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((item) => (
          <div key={item.label} className="p-3 rounded-lg border bg-background text-center">
            <p className="text-2xl font-bold">{item.value}</p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
            {item.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function SystemStatusSection() {
  const [info, setInfo] = useState<any>(null);
  useEffect(() => { api.info().then(setInfo).catch(() => {}); }, []);
  if (!info) return null;

  const items = [
    { label: "AI 服务", enabled: info.ai },
    { label: "对象存储 (MinIO)", enabled: info.storage },
  ];

  return (
    <Card className="space-y-3">
      <h3 className="text-sm font-medium">系统状态</h3>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <span>{item.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${item.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              {item.enabled ? "已启用" : "未配置"}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AIConfigSection() {
  const [config, setConfig] = useState<any>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [maxHistory, setMaxHistory] = useState(20);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await api.getAIConfig();
      setConfig(data);
      setBaseUrl(data.base_url || "");
      setModel(data.model || "");
      setSystemPrompt(data.system_prompt || "");
      setMaxHistory(parseInt(data.max_history) || 20);
      setApiKey("");
    } catch { /* not admin */ }
  }

  useEffect(() => { load(); }, []);
  if (!config) return null;

  const configured = config.enabled === "true";

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      let url = baseUrl.replace(/\/+$/, "");
      if (url && !url.endsWith("/v1")) url += "/v1";
      setBaseUrl(url);
      await api.setAIConfig({
        base_url: url,
        api_key: apiKey || undefined,
        model: model || undefined,
        system_prompt: systemPrompt,
        max_history: String(maxHistory || 20),
      });
      load();
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("删除全局 AI 配置？")) return;
    await api.deleteAIConfig();
    load();
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">全局 AI 配置</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            配置后渠道可选择「内置」模式，无需单独填写 API Key
          </p>
        </div>
        {configured && (
          <Button variant="ghost" size="sm" onClick={handleDelete}>
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
        )}
      </div>
      <div className="space-y-2">
        <Input placeholder="https://api.openai.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="h-8 text-xs font-mono" />
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder={configured ? `已配置 (${config.api_key})，留空保持不变` : "API Key"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="h-8 text-xs font-mono"
          />
          <Input placeholder="模型名称" value={model} onChange={(e) => setModel(e.target.value)} className="h-8 text-xs font-mono w-40" />
        </div>
        <textarea
          placeholder="默认系统提示词（System Prompt），渠道未设置时使用"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring resize-none"
        />
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-muted-foreground shrink-0">默认上下文消息数</label>
          <Input type="number" value={maxHistory} onChange={(e) => setMaxHistory(parseInt(e.target.value) || 20)} className="h-8 text-xs w-20" min={1} max={100} />
        </div>
      </div>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}>保存</Button>
      </div>
    </Card>
  );
}

function OAuthConfigSection() {
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState("");

  async function loadConfig() {
    try {
      const data = await api.getOAuthConfig();
      setConfig(data);
    } catch { /* not admin */ }
  }

  useEffect(() => { loadConfig(); }, []);
  if (!config) return null;

  const callbackBase = window.location.origin + "/api/auth/oauth/";

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">OAuth 配置</h3>
        <p className="text-xs text-muted-foreground mt-1">
          管理员可在此配置第三方登录，无需重启服务。DB 配置优先于环境变量。
        </p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {Object.keys(providerLabels).map((name) => (
        <OAuthProviderForm
          key={name}
          name={name}
          label={providerLabels[name]}
          config={config[name]}
          callbackURL={callbackBase + name + "/callback"}
          help={providerCallbackHelp[name]}
          onSaved={loadConfig}
          onError={setError}
        />
      ))}
    </Card>
  );
}

function OAuthProviderForm({
  name, label, config, callbackURL, help, onSaved, onError,
}: {
  name: string; label: string; config: any; callbackURL: string;
  help: string; onSaved: () => void; onError: (msg: string) => void;
}) {
  const [clientId, setClientId] = useState(config?.client_id || "");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setClientId(config?.client_id || "");
    setClientSecret("");
  }, [config]);

  async function handleSave() {
    if (!clientId.trim()) { onError("Client ID 不能为空"); return; }
    setSaving(true);
    onError("");
    try {
      await api.setOAuthConfig(name, { client_id: clientId.trim(), client_secret: clientSecret });
      onSaved();
    } catch (err: any) { onError(err.message); }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm(`删除 ${label} 的 OAuth 配置？将回退到环境变量配置。`)) return;
    onError("");
    try { await api.deleteOAuthConfig(name); onSaved(); } catch (err: any) { onError(err.message); }
  }

  const source = config?.source;
  const enabled = config?.enabled;

  return (
    <div className="space-y-2 p-3 rounded-lg border bg-background">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium">{label}</span>
          {enabled && (
            <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
              source === "db" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {source === "db" ? "数据库" : "环境变量"}
            </span>
          )}
        </div>
        {source === "db" && (
          <Button variant="ghost" size="sm" onClick={handleDelete}>
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Input placeholder="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-8 text-xs font-mono" />
        <Input type="password" placeholder={enabled ? "Client Secret（留空保持不变）" : "Client Secret"} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} className="h-8 text-xs font-mono" />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          <p>回调地址：<code className="select-all">{callbackURL}</code></p>
          <p>{help}</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1" /> 保存
        </Button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { api } from "../lib/api";
import { Send, BookOpen, Bot, Shield } from "lucide-react";

export function SubmitForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [mode, setMode] = useState<"github" | "paste">("github");
  const [url, setUrl] = useState("");
  const [script, setScript] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = mode === "github" ? { github_url: url.trim() } : { script: script.trim() };
    if (!data.github_url && !data.script) return;
    setSubmitting(true); setError("");
    try {
      await api.submitPlugin(data);
      setUrl(""); setScript("");
      onSubmitted();
    } catch (err: any) { setError(err.message); }
    setSubmitting(false);
  }

  const canSubmit = mode === "github" ? !!url.trim() : !!script.trim();

  const templateScript = `// ==WebhookPlugin==
// @name         我的插件
// @namespace    github.com/yourname
// @version      1.0.0
// @description  插件功能描述
// @author       你的名字
// @license      MIT
// @icon         🔔
// @match        text
// @connect      *
// @grant        none
// ==/WebhookPlugin==

function onRequest(ctx) {
  ctx.req.body = JSON.stringify({
    text: ctx.msg.sender + ": " + ctx.msg.content
  });
}`;

  return (
    <div className="space-y-4">
      {/* AI development tip */}
      <Card className="flex items-start gap-3 bg-primary/5 border-primary/20">
        <Bot className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-xs">
          <p className="font-medium">推荐：让 AI 帮你写插件</p>
          <p className="text-muted-foreground mt-0.5">
            将 <a href="/api/webhook-plugins/skill.md" target="_blank" className="text-primary hover:underline">skill.md</a> 链接发给 AI 助手，描述你的需求，AI 会生成完整的插件代码。生成后粘贴到下方提交即可。
          </p>
        </div>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-medium">提交 Webhook 插件</h3>

        <div className="flex border rounded-lg overflow-hidden w-fit">
          <button className={`px-3 py-1 text-xs cursor-pointer ${mode === "github" ? "bg-secondary" : "text-muted-foreground"}`} onClick={() => setMode("github")}>GitHub 链接</button>
          <button className={`px-3 py-1 text-xs cursor-pointer ${mode === "paste" ? "bg-secondary" : "text-muted-foreground"}`} onClick={() => setMode("paste")}>粘贴脚本</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          {mode === "github" ? (
            <>
              <Input value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/user/repo/blob/main/plugin.js"
                className="h-8 text-xs font-mono" />
              <p className="text-[10px] text-muted-foreground">自动拉取脚本并固定 commit hash，确保审核的代码就是运行的代码。</p>
            </>
          ) : (
            <>
              <textarea value={script} onChange={(e) => setScript(e.target.value)}
                placeholder={templateScript}
                rows={16}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-[11px] font-mono placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring resize-none" />
              <p className="text-[10px] text-muted-foreground">
                使用 <code className="bg-secondary px-1 rounded">{"// ==WebhookPlugin=="}</code> 格式声明元数据。
                <a href="/api/webhook-plugins/skill.md" target="_blank" className="text-primary hover:underline ml-1">查看完整规范</a>
              </p>
            </>
          )}
          <div className="flex items-center justify-between">
            {error && <span className="text-xs text-destructive">{error}</span>}
            <Button type="submit" size="sm" disabled={submitting || !canSubmit} className="ml-auto">
              <Send className="w-3.5 h-3.5 mr-1" /> {submitting ? "提交中..." : "提交审核"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Quick reference */}
      <Card className="space-y-2">
        <h3 className="text-xs font-medium">快速参考</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
          <div className="p-2 rounded border bg-background">
            <p className="font-medium mb-1">ctx.msg（消息）</p>
            <p className="text-muted-foreground">.sender .content .msg_type .channel_id .bot_id .timestamp .items[]</p>
          </div>
          <div className="p-2 rounded border bg-background">
            <p className="font-medium mb-1">ctx.req（请求）</p>
            <p className="text-muted-foreground">.url .method .headers .body</p>
          </div>
          <div className="p-2 rounded border bg-background">
            <p className="font-medium mb-1">全局函数</p>
            <p className="text-muted-foreground">reply(text) skip() JSON.parse/stringify</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span><Shield className="w-3 h-3 inline" /> 5s 超时</span>
          <span>栈深 64</span>
          <span>禁止 eval/require</span>
          <span>reply 最多 10 次</span>
          <a href="/api/webhook-plugins/skill.md" target="_blank" className="text-primary hover:underline ml-auto flex items-center gap-0.5">
            <BookOpen className="w-3 h-3" /> 完整文档
          </a>
        </div>
      </Card>
    </div>
  );
}

import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Bot, Puzzle, Webhook, Cable, Shield, Zap } from "lucide-react";

const features = [
  { icon: Bot, title: "多 Bot 管理", desc: "同时管理多个微信 Bot，每个 Bot 独立运行、独立配置" },
  { icon: Cable, title: "渠道路由", desc: "通过 @提及 将消息路由到不同渠道，支持 WebSocket 和 HTTP API" },
  { icon: Webhook, title: "Webhook 推送", desc: "收到消息自动推送到你的服务，支持自定义脚本中间件" },
  { icon: Puzzle, title: "插件市场", desc: "社区驱动的 Webhook 插件市场，一键安装飞书、Slack 等通知集成" },
  { icon: Zap, title: "AI 自动回复", desc: "内置 OpenAI 兼容的 AI 回复能力，渠道级别开关控制" },
  { icon: Shield, title: "安全沙箱", desc: "插件脚本在安全沙箱中执行，5 秒超时、栈深限制、禁止危险 API" },
];

export function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <span className="font-semibold text-sm">OpenILink Hub</span>
        <div className="flex items-center gap-2">
          <Link to="/plugins">
            <Button variant="ghost" size="sm" className="text-xs">插件市场</Button>
          </Link>
          <Link to="/login">
            <Button size="sm" className="text-xs">登录</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="py-16 px-6 text-center max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight">OpenILink Hub</h1>
          <p className="mt-3 text-muted-foreground">
            开源的微信 Bot 管理与消息中继平台。连接你的微信，通过 WebSocket、HTTP API 或 Webhook 接收和发送消息。
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/login">
              <Button>开始使用</Button>
            </Link>
            <a href="https://github.com/openilink/openilink-hub" target="_blank" rel="noopener">
              <Button variant="outline">GitHub</Button>
            </a>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 pb-16 max-w-4xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => (
              <Card key={f.title} className="space-y-2">
                <div className="flex items-center gap-2">
                  <f.icon className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-medium">{f.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 pb-16 max-w-2xl mx-auto">
          <h2 className="text-lg font-semibold text-center mb-6">工作流程</h2>
          <div className="space-y-4 text-sm">
            {[
              { step: "1", title: "扫码绑定", desc: "在 Hub 中扫码登录你的微信账号，系统自动创建 Bot" },
              { step: "2", title: "创建渠道", desc: "为 Bot 创建一个或多个渠道，每个渠道有独立的 API Key" },
              { step: "3", title: "接入集成", desc: "通过 WebSocket 实时监听，HTTP API 轮询，或 Webhook 推送接收消息" },
              { step: "4", title: "安装插件", desc: "从插件市场一键安装通知转发、AI 回复等 Webhook 插件" },
            ].map((s) => (
              <div key={s.step} className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">{s.step}</span>
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-muted-foreground text-xs">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        <a href="https://github.com/openilink/openilink-hub" target="_blank" rel="noopener" className="hover:text-primary">
          OpenILink Hub
        </a>
        {" · "}开源微信 Bot 管理平台
      </footer>
    </div>
  );
}

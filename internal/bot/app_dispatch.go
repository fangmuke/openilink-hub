package bot

import (
	"context"
	"log/slog"
	"time"

	appdelivery "github.com/openilink/openilink-hub/internal/app"
	"github.com/openilink/openilink-hub/internal/provider"
)

// deliverToApps dispatches a message to matching App installations.
// It handles both slash commands and event subscriptions.
func (m *Manager) deliverToApps(inst *Instance, msg provider.InboundMessage, p parsedMessage) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("deliverToApps panic", "bot", inst.DBID, "err", r)
		}
	}()

	content := p.content

	// Check for slash command: /command args or @command args
	if m.tryDeliverCommand(inst, msg, p, content) {
		return // command handled, don't also deliver as generic event
	}

	// Deliver as generic event to subscribed apps
	eventType := "message." + p.msgType
	installations, err := m.appDisp.MatchEvent(inst.DBID, eventType)
	if err != nil {
		slog.Error("app match event failed", "bot", inst.DBID, "err", err)
		return
	}

	if len(installations) == 0 {
		return
	}

	event := appdelivery.NewEvent(eventType, map[string]any{
		"message_id": msg.ExternalID,
		"sender":     map[string]any{"id": msg.Sender, "name": msg.Sender},
		"group":      groupInfo(msg),
		"content":    content,
		"msg_type":   p.msgType,
		"items":      p.relayItems,
	})

	for i := range installations {
		result := m.appDisp.DeliverWithRetry(&installations[i], event)
		if result != nil && result.Reply != "" {
			m.sendAppReply(inst, msg.Sender, result.Reply)
		}
	}
}

// tryDeliverCommand checks if the message is a /command or @command and delivers it.
func (m *Manager) tryDeliverCommand(inst *Instance, msg provider.InboundMessage, p parsedMessage, content string) bool {
	installations, command, args, err := m.appDisp.MatchCommand(inst.DBID, content)
	if err != nil {
		slog.Error("app match command failed", "bot", inst.DBID, "err", err)
		return false
	}
	if len(installations) == 0 {
		return false
	}

	event := appdelivery.NewEvent("command", map[string]any{
		"command": command,
		"text":    args,
		"sender":  map[string]any{"id": msg.Sender, "name": msg.Sender},
		"group":   groupInfo(msg),
	})

	for i := range installations {
		result := m.appDisp.DeliverWithRetry(&installations[i], event)
		if result != nil && result.Reply != "" {
			m.sendAppReply(inst, msg.Sender, result.Reply)
		}
	}
	return true
}

// sendAppReply sends a text reply from an App via the bot.
func (m *Manager) sendAppReply(inst *Instance, to, text string) {
	if text == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	clientID, err := inst.Provider.Send(ctx, provider.OutboundMessage{
		Recipient: to,
		Text:      text,
	})
	if err != nil {
		slog.Error("app reply send failed", "bot", inst.DBID, "to", to, "err", err)
		return
	}
	slog.Info("app reply sent", "bot", inst.DBID, "to", to, "client_id", clientID)
}

func groupInfo(msg provider.InboundMessage) any {
	if msg.GroupID == "" {
		return nil
	}
	return map[string]any{"id": msg.GroupID, "name": msg.GroupID}
}

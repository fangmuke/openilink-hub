package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/openilink/openilink-hub/internal/database"
	"github.com/openilink/openilink-hub/internal/provider"
)

// generateTraceID creates a random trace ID with the "tr_" prefix.
func generateTraceID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return "tr_" + hex.EncodeToString(b)
}

// handleBotAPISend handles POST /bot/v1/messages/send.
func (s *Server) handleBotAPISend(w http.ResponseWriter, r *http.Request) {
	inst := installationFromContext(r.Context())
	if inst == nil {
		botAPIError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Check scope
	if !s.requireScope(inst, "messages.send") {
		botAPIError(w, "missing scope: messages.send", http.StatusForbidden)
		return
	}

	// Parse request body
	var req struct {
		To      string `json:"to"`
		Type    string `json:"type"`
		Content string `json:"content"`
		TraceID string `json:"trace_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		botAPIError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.To == "" {
		botAPIError(w, "to is required", http.StatusBadRequest)
		return
	}

	if req.Content == "" {
		botAPIError(w, "content is required", http.StatusBadRequest)
		return
	}

	if req.Type == "" {
		req.Type = "text"
	}

	// Generate trace ID if not provided
	traceID := req.TraceID
	if traceID == "" {
		traceID = r.Header.Get("X-Trace-Id")
	}
	if traceID == "" {
		traceID = generateTraceID()
	}

	// Get the bot instance
	botInst, ok := s.BotManager.GetInstance(inst.BotID)
	if !ok {
		// Check if bot exists and status
		bot, err := s.DB.GetBot(inst.BotID)
		if err != nil {
			botAPIError(w, "bot not found", http.StatusNotFound)
			return
		}
		if bot.Status == "session_expired" {
			botAPIError(w, "bot session expired", http.StatusServiceUnavailable)
			return
		}
		botAPIError(w, "bot not connected", http.StatusServiceUnavailable)
		return
	}

	// Auto-fill context_token from latest message if not available
	contextToken := s.DB.GetLatestContextToken(inst.BotID)

	// Send the message
	clientID, err := botInst.Send(r.Context(), provider.OutboundMessage{
		Recipient:    req.To,
		Text:         req.Content,
		ContextToken: contextToken,
	})
	if err != nil {
		slog.Error("bot api: send failed", "bot_id", inst.BotID, "err", err)
		botAPIError(w, "send failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	// Save outbound message to DB
	itemList, _ := json.Marshal([]map[string]any{{"type": req.Type, "text": req.Content}})
	s.DB.SaveMessage(&database.Message{
		BotID:       inst.BotID,
		Direction:   "outbound",
		ToUserID:    req.To,
		MessageType: 2,
		ItemList:    itemList,
	})

	// Respond
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"ok":        true,
		"client_id": clientID,
		"trace_id":  traceID,
	})
}

// handleBotAPIContacts handles GET /bot/v1/contacts.
func (s *Server) handleBotAPIContacts(w http.ResponseWriter, r *http.Request) {
	inst := installationFromContext(r.Context())
	if inst == nil {
		botAPIError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Check scope
	if !s.requireScope(inst, "contacts.read") {
		botAPIError(w, "missing scope: contacts.read", http.StatusForbidden)
		return
	}

	contacts, err := s.DB.ListRecentContacts(inst.BotID, 100)
	if err != nil {
		slog.Error("bot api: list contacts failed", "bot_id", inst.BotID, "err", err)
		botAPIError(w, "failed to list contacts", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"ok":       true,
		"contacts": contacts,
	})
}

// handleBotAPIBotInfo handles GET /bot/v1/bot.
func (s *Server) handleBotAPIBotInfo(w http.ResponseWriter, r *http.Request) {
	inst := installationFromContext(r.Context())
	if inst == nil {
		botAPIError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Check scope
	if !s.requireScope(inst, "bot.read") {
		botAPIError(w, "missing scope: bot.read", http.StatusForbidden)
		return
	}

	bot, err := s.DB.GetBot(inst.BotID)
	if err != nil {
		slog.Error("bot api: get bot failed", "bot_id", inst.BotID, "err", err)
		botAPIError(w, "bot not found", http.StatusNotFound)
		return
	}

	// Get live status from manager if available
	status := bot.Status
	if botInst, ok := s.BotManager.GetInstance(inst.BotID); ok {
		status = botInst.Status()
	}

	// Build response — exclude sensitive fields like credentials
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"ok": true,
		"bot": map[string]any{
			"id":         bot.ID,
			"name":       bot.Name,
			"provider":   bot.Provider,
			"status":     status,
			"msg_count":  bot.MsgCount,
			"created_at": bot.CreatedAt,
			"updated_at": bot.UpdatedAt,
		},
	})
}

// handleBotAPINotFound returns a 404 for unknown Bot API paths.
func (s *Server) handleBotAPINotFound(w http.ResponseWriter, r *http.Request) {
	_ = time.Now() // ensure time import used
	botAPIError(w, "unknown endpoint", http.StatusNotFound)
}

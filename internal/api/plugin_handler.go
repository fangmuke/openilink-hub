package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/openilink/openilink-hub/internal/auth"
	"github.com/openilink/openilink-hub/internal/database"
)

// POST /api/plugins/submit
// Body: {"github_url": "https://github.com/user/repo/blob/main/plugin.js"}
func (s *Server) handleSubmitPlugin(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	var req struct {
		GithubURL string `json:"github_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.GithubURL == "" {
		jsonError(w, "github_url required", http.StatusBadRequest)
		return
	}

	// Parse GitHub URL → raw content URL + fetch commit hash
	rawURL, owner, repo, path, err := parseGithubBlobURL(req.GithubURL)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Fetch script content
	script, err := fetchURL(rawURL)
	if err != nil {
		jsonError(w, "failed to fetch script: "+err.Error(), http.StatusBadGateway)
		return
	}

	// Fetch latest commit hash for this file
	commitHash, err := fetchGithubCommitHash(owner, repo, path)
	if err != nil {
		slog.Warn("failed to fetch commit hash, using empty", "err", err)
	}

	// Parse plugin metadata from script comments
	meta := parsePluginMeta(script)
	if meta.Name == "" {
		jsonError(w, "plugin must have @name in comments", http.StatusBadRequest)
		return
	}

	configSchema, _ := json.Marshal(meta.Config)

	plugin, err := s.DB.CreatePlugin(&database.Plugin{
		Name:         meta.Name,
		Description:  meta.Description,
		Author:       meta.Author,
		Version:      meta.Version,
		GithubURL:    req.GithubURL,
		CommitHash:   commitHash,
		Script:       script,
		ConfigSchema: configSchema,
		SubmittedBy:  userID,
	})
	if err != nil {
		jsonError(w, "save failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(plugin)
}

// GET /api/plugins — list approved plugins (marketplace)
func (s *Server) handleListPlugins(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "approved"
	}
	// Only admin can see pending/rejected
	if status != "approved" {
		user, _ := s.DB.GetUserByID(auth.UserIDFromContext(r.Context()))
		if user == nil || user.Role != database.RoleAdmin {
			status = "approved"
		}
	}

	plugins, err := s.DB.ListPlugins(status)
	if err != nil {
		jsonError(w, "list failed", http.StatusInternalServerError)
		return
	}
	// Don't expose script content in list
	for i := range plugins {
		plugins[i].Script = ""
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(plugins)
}

// GET /api/plugins/{id} — get plugin detail (with script for admin/owner)
func (s *Server) handleGetPlugin(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	plugin, err := s.DB.GetPlugin(id)
	if err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}

	userID := auth.UserIDFromContext(r.Context())
	user, _ := s.DB.GetUserByID(userID)
	isAdmin := user != nil && user.Role == database.RoleAdmin
	isOwner := plugin.SubmittedBy == userID

	// Only admin and owner can see pending/rejected plugins
	if plugin.Status != "approved" && !isAdmin && !isOwner {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	// Hide script from non-admin non-owner (they can see it on GitHub)
	if !isAdmin && !isOwner {
		plugin.Script = ""
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(plugin)
}

// PUT /api/admin/plugins/{id}/review — approve or reject
func (s *Server) handleReviewPlugin(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := auth.UserIDFromContext(r.Context())

	var req struct {
		Status string `json:"status"` // "approved" or "rejected"
		Reason string `json:"reason"` // rejection reason (optional)
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Status != "approved" && req.Status != "rejected" {
		jsonError(w, "status must be approved or rejected", http.StatusBadRequest)
		return
	}

	if err := s.DB.UpdatePluginStatus(id, req.Status, userID, req.Reason); err != nil {
		jsonError(w, "update failed", http.StatusInternalServerError)
		return
	}
	jsonOK(w)
}

// DELETE /api/admin/plugins/{id}
func (s *Server) handleDeletePlugin(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.DB.DeletePlugin(id); err != nil {
		jsonError(w, "delete failed", http.StatusInternalServerError)
		return
	}
	jsonOK(w)
}

// POST /api/plugins/{id}/install — get script for installation into a channel
func (s *Server) handleInstallPlugin(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	plugin, err := s.DB.GetPlugin(id)
	if err != nil || plugin.Status != "approved" {
		jsonError(w, "plugin not found or not approved", http.StatusNotFound)
		return
	}

	userID := auth.UserIDFromContext(r.Context())
	s.DB.RecordPluginInstall(id, userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"plugin_id":     plugin.ID,
		"name":          plugin.Name,
		"script":        plugin.Script,
		"config_schema": plugin.ConfigSchema,
	})
}

// --- Helpers ---

var githubBlobRe = regexp.MustCompile(`^https?://github\.com/([^/]+)/([^/]+)/blob/([^/]+)/(.+)$`)

func parseGithubBlobURL(url string) (rawURL, owner, repo, path string, err error) {
	m := githubBlobRe.FindStringSubmatch(url)
	if m == nil {
		return "", "", "", "", fmt.Errorf("invalid GitHub URL, expected: https://github.com/user/repo/blob/branch/path/to/plugin.js")
	}
	owner, repo, branch, path := m[1], m[2], m[3], m[4]
	rawURL = fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/%s", owner, repo, branch, path)
	return rawURL, owner, repo, path, nil
}

func fetchURL(url string) (string, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func fetchGithubCommitHash(owner, repo, path string) (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/commits?path=%s&per_page=1", owner, repo, path)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var commits []struct {
		SHA string `json:"sha"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&commits); err != nil || len(commits) == 0 {
		return "", fmt.Errorf("no commits found")
	}
	return commits[0].SHA, nil
}

type pluginMeta struct {
	Name        string
	Description string
	Author      string
	Version     string
	Config      []database.ConfigField
}

var metaRe = regexp.MustCompile(`//\s*@(\w+)\s+(.+)`)

func parsePluginMeta(script string) pluginMeta {
	var meta pluginMeta
	for _, line := range strings.Split(script, "\n") {
		m := metaRe.FindStringSubmatch(strings.TrimSpace(line))
		if m == nil {
			continue
		}
		key, val := m[1], strings.TrimSpace(m[2])
		switch key {
		case "name":
			meta.Name = val
		case "description":
			meta.Description = val
		case "author":
			meta.Author = val
		case "version":
			meta.Version = val
		case "config":
			// Format: name type "description"
			parts := strings.SplitN(val, " ", 3)
			if len(parts) >= 2 {
				desc := ""
				if len(parts) == 3 {
					desc = strings.Trim(parts[2], `"`)
				}
				meta.Config = append(meta.Config, database.ConfigField{
					Name: parts[0], Type: parts[1], Description: desc,
				})
			}
		}
	}
	return meta
}

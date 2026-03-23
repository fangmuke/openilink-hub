package database

import (
	"fmt"
)

func truncateStr(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

// AppEventLog records an event delivery attempt.
type AppEventLog struct {
	ID             int64  `json:"id"`
	InstallationID string `json:"installation_id"`
	TraceID        string `json:"trace_id"`
	EventType      string `json:"event_type"`
	EventID        string `json:"event_id"`
	RequestBody    string `json:"request_body,omitempty"`
	ResponseStatus int    `json:"response_status"`
	ResponseBody   string `json:"response_body,omitempty"`
	Status         string `json:"status"` // pending/delivered/failed/retrying
	RetryCount     int    `json:"retry_count"`
	Error          string `json:"error,omitempty"`
	DurationMs     int    `json:"duration_ms"`
	CreatedAt      int64  `json:"created_at"`
}

// CreateEventLog inserts a new event delivery log.
func (db *DB) CreateEventLog(log *AppEventLog) (int64, error) {
	var id int64
	err := db.QueryRow(`INSERT INTO app_event_logs (installation_id, trace_id, event_type, event_id, request_body, status)
		VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id`,
		log.InstallationID, log.TraceID, log.EventType, log.EventID, log.RequestBody,
	).Scan(&id)
	return id, err
}

// UpdateEventLogDelivered marks an event as delivered.
func (db *DB) UpdateEventLogDelivered(id int64, respStatus int, respBody string, durationMs int) error {
	_, err := db.Exec(`UPDATE app_event_logs SET status='delivered', response_status=$1, response_body=$2, duration_ms=$3 WHERE id=$4`,
		respStatus, truncateStr(respBody, 4096), durationMs, id)
	return err
}

// UpdateEventLogFailed marks an event delivery as failed.
func (db *DB) UpdateEventLogFailed(id int64, errMsg string, retryCount int, durationMs int) error {
	status := "failed"
	if retryCount < 3 {
		status = "retrying"
	}
	_, err := db.Exec(`UPDATE app_event_logs SET status=$1, error=$2, retry_count=$3, duration_ms=$4 WHERE id=$5`,
		status, errMsg, retryCount, durationMs, id)
	return err
}

// ListEventLogs returns recent event logs for an installation.
func (db *DB) ListEventLogs(installationID string, limit int) ([]AppEventLog, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := db.Query(fmt.Sprintf(`SELECT id, installation_id, trace_id, event_type, event_id,
		request_body, response_status, response_body,
		status, retry_count, error, duration_ms,
		EXTRACT(EPOCH FROM created_at)::BIGINT
		FROM app_event_logs WHERE installation_id = $1
		ORDER BY id DESC LIMIT %d`, limit), installationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var logs []AppEventLog
	for rows.Next() {
		var l AppEventLog
		if err := rows.Scan(&l.ID, &l.InstallationID, &l.TraceID, &l.EventType, &l.EventID,
			&l.RequestBody, &l.ResponseStatus, &l.ResponseBody,
			&l.Status, &l.RetryCount, &l.Error, &l.DurationMs,
			&l.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}

// AppAPILog records an API call from an app.
type AppAPILog struct {
	ID             int64  `json:"id"`
	InstallationID string `json:"installation_id"`
	TraceID        string `json:"trace_id"`
	Method         string `json:"method"`
	Path           string `json:"path"`
	RequestBody    string `json:"request_body,omitempty"`
	StatusCode     int    `json:"status_code"`
	ResponseBody   string `json:"response_body,omitempty"`
	DurationMs     int    `json:"duration_ms"`
	CreatedAt      int64  `json:"created_at"`
}

// CreateAPILog inserts an API call log.
func (db *DB) CreateAPILog(log *AppAPILog) error {
	_, err := db.Exec(`INSERT INTO app_api_logs (installation_id, trace_id, method, path, request_body, status_code, response_body, duration_ms)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		log.InstallationID, log.TraceID, log.Method, log.Path,
		truncateStr(log.RequestBody, 4096), log.StatusCode,
		truncateStr(log.ResponseBody, 4096), log.DurationMs)
	return err
}

// ListAPILogs returns recent API logs for an installation.
func (db *DB) ListAPILogs(installationID string, limit int) ([]AppAPILog, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := db.Query(fmt.Sprintf(`SELECT id, installation_id, trace_id, method, path,
		request_body, status_code, response_body, duration_ms,
		EXTRACT(EPOCH FROM created_at)::BIGINT
		FROM app_api_logs WHERE installation_id = $1
		ORDER BY id DESC LIMIT %d`, limit), installationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var logs []AppAPILog
	for rows.Next() {
		var l AppAPILog
		if err := rows.Scan(&l.ID, &l.InstallationID, &l.TraceID, &l.Method, &l.Path,
			&l.RequestBody, &l.StatusCode, &l.ResponseBody, &l.DurationMs,
			&l.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}

// CleanOldAppLogs removes logs older than given days.
func (db *DB) CleanOldAppLogs(days int) error {
	interval := fmt.Sprintf("%d", days)
	_, _ = db.Exec("DELETE FROM app_event_logs WHERE created_at < NOW() - INTERVAL '1 day' * " + interval)
	_, _ = db.Exec("DELETE FROM app_api_logs WHERE created_at < NOW() - INTERVAL '1 day' * " + interval)
	return nil
}

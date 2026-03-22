package ilink

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"

	"bytes"
	"encoding/base64"
	"strings"
	"time"

	ilink "github.com/openilink/openilink-sdk-go"
	"github.com/openilink/openilink-hub/internal/provider"
	"github.com/youthlin/silk"
)

func init() {
	provider.Register("ilink", func() provider.Provider {
		return &Provider{}
	})
}

// Credentials stored as JSONB in bots.credentials.
type Credentials struct {
	BotID       string `json:"bot_id"`
	BotToken    string `json:"bot_token"`
	BaseURL     string `json:"base_url,omitempty"`
	ILinkUserID string `json:"ilink_user_id,omitempty"`
}

type syncState struct {
	SyncBuf string `json:"sync_buf"`
}

type Provider struct {
	client *ilink.Client
	creds  Credentials
	cancel context.CancelFunc
	status atomic.Value
	mu     sync.Mutex
}

func (p *Provider) Name() string { return "ilink" }

func (p *Provider) Status() string {
	v := p.status.Load()
	if v == nil {
		return "disconnected"
	}
	return v.(string)
}

func (p *Provider) Start(ctx context.Context, opts provider.StartOptions) error {
	var creds Credentials
	if err := json.Unmarshal(opts.Credentials, &creds); err != nil {
		return err
	}
	p.creds = creds

	clientOpts := []ilink.Option{
		ilink.WithSILKDecoder(decodeSILK),
	}
	if creds.BaseURL != "" {
		clientOpts = append(clientOpts, ilink.WithBaseURL(creds.BaseURL))
	}
	p.client = ilink.NewClient(creds.BotToken, clientOpts...)

	var ss syncState
	if opts.SyncState != nil {
		json.Unmarshal(opts.SyncState, &ss)
	}

	ctx, p.cancel = context.WithCancel(ctx)
	p.status.Store("connected")
	if opts.OnStatus != nil {
		opts.OnStatus("connected")
	}

	go func() {
		err := p.client.Monitor(ctx, func(msg ilink.WeixinMessage) {
			if opts.OnMessage != nil {
				opts.OnMessage(convertInbound(msg))
			}
		}, &ilink.MonitorOptions{
			InitialBuf: ss.SyncBuf,
			OnBufUpdate: func(buf string) {
				if opts.OnSyncUpdate != nil {
					data, _ := json.Marshal(syncState{SyncBuf: buf})
					opts.OnSyncUpdate(data)
				}
			},
			OnError: func(err error) {
				slog.Warn("ilink monitor error", "err", err)
			},
			OnSessionExpired: func() {
				slog.Error("ilink session expired")
				p.status.Store("session_expired")
				if opts.OnStatus != nil {
					opts.OnStatus("session_expired")
				}
			},
		})

		// Don't overwrite session_expired — that's a terminal state
		if p.Status() != "session_expired" {
			var newStatus string
			if err != nil && err != context.Canceled {
				slog.Error("ilink monitor stopped", "err", err)
				newStatus = "error"
			} else {
				newStatus = "disconnected"
			}
			p.status.Store(newStatus)
			if opts.OnStatus != nil {
				opts.OnStatus(newStatus)
			}
		}
	}()

	return nil
}

func (p *Provider) Stop() {
	if p.cancel != nil {
		p.cancel()
	}
}

func (p *Provider) Send(ctx context.Context, msg provider.OutboundMessage) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	recipient := msg.Recipient
	if recipient == "" {
		recipient = p.creds.ILinkUserID
	}

	// Media send
	if len(msg.Data) > 0 && msg.FileName != "" {
		// Voice: encode WAV/PCM to SILK before sending
		if isVoiceFile(msg.FileName) {
			return p.sendVoice(ctx, recipient, msg.ContextToken, msg.Data)
		}
		err := p.client.SendMediaFile(ctx, recipient, msg.ContextToken, msg.Data, msg.FileName, msg.Text)
		if err != nil {
			return "", err
		}
		return "", nil
	}

	// Text send
	if msg.ContextToken != "" {
		return p.client.SendText(ctx, recipient, msg.Text, msg.ContextToken)
	}
	return p.client.Push(ctx, recipient, msg.Text)
}

func (p *Provider) SendTyping(ctx context.Context, recipient, ticket string, typing bool) error {
	status := ilink.Typing
	if !typing {
		status = ilink.CancelTyping
	}
	if recipient == "" {
		recipient = p.creds.ILinkUserID
	}
	return p.client.SendTyping(ctx, recipient, ticket, status)
}

func (p *Provider) GetConfig(ctx context.Context, recipient, contextToken string) (*provider.BotConfig, error) {
	if recipient == "" {
		recipient = p.creds.ILinkUserID
	}
	resp, err := p.client.GetConfig(ctx, recipient, contextToken)
	if err != nil {
		return nil, err
	}
	return &provider.BotConfig{
		TypingTicket: resp.TypingTicket,
	}, nil
}

func (p *Provider) DownloadMedia(ctx context.Context, encryptQueryParam, aesKey string) ([]byte, error) {
	return p.client.DownloadFile(ctx, encryptQueryParam, aesKey)
}

func (p *Provider) DownloadVoice(ctx context.Context, encryptQueryParam, aesKey string, _ int) ([]byte, error) {
	return p.client.DownloadVoice(ctx, &ilink.CDNMedia{
		EncryptQueryParam: encryptQueryParam,
		AESKey:            aesKey,
	})
}

func decodeSILK(data []byte, sampleRate int) ([]byte, error) {
	return silk.Decode(bytes.NewReader(data), silk.WithSampleRate(sampleRate))
}

func isVoiceFile(filename string) bool {
	lower := strings.ToLower(filename)
	return strings.HasSuffix(lower, ".wav") ||
		strings.HasSuffix(lower, ".mp3") ||
		strings.HasSuffix(lower, ".ogg") ||
		strings.HasSuffix(lower, ".silk") ||
		strings.HasSuffix(lower, ".pcm")
}

// sendVoice encodes audio to SILK, uploads to CDN, and sends as voice message.
func (p *Provider) sendVoice(ctx context.Context, recipient, contextToken string, data []byte) (string, error) {
	// Extract PCM from WAV (skip 44-byte header if present)
	pcm := data
	if len(data) > 44 && string(data[:4]) == "RIFF" {
		pcm = data[44:]
	}

	// Encode PCM → SILK
	silkData, err := silk.Encode(bytes.NewReader(pcm), silk.SampleRate(24000))
	if err != nil {
		return "", fmt.Errorf("silk encode: %w", err)
	}

	// Upload as voice
	uploaded, err := p.client.UploadFile(ctx, silkData, recipient, ilink.MediaVoice)
	if err != nil {
		return "", fmt.Errorf("upload voice: %w", err)
	}

	// Build and send voice message
	clientID := fmt.Sprintf("voice-%d", time.Now().UnixMilli())
	msg := &ilink.SendMessageReq{
		Msg: &ilink.WeixinMessage{
			ToUserID:     recipient,
			ClientID:     clientID,
			MessageType:  ilink.MsgTypeBot,
			MessageState: ilink.StateFinish,
			ContextToken: contextToken,
			ItemList: []ilink.MessageItem{{
				Type: ilink.ItemVoice,
				VoiceItem: &ilink.VoiceItem{
					Media: &ilink.CDNMedia{
						EncryptQueryParam: uploaded.DownloadEncryptedQueryParam,
						AESKey:            base64.StdEncoding.EncodeToString([]byte(uploaded.AESKey)),
					},
					EncodeType: 6, // SILK
					SampleRate: 24000,
				},
			}},
		},
	}
	if err := p.client.SendMessage(ctx, msg); err != nil {
		return "", err
	}
	return clientID, nil
}

func convertInbound(msg ilink.WeixinMessage) provider.InboundMessage {
	var items []provider.MessageItem
	for _, item := range msg.ItemList {
		mi := convertItem(item)
		if mi != nil {
			items = append(items, *mi)
		}
	}

	// Store the original WeixinMessage as raw JSON
	raw, _ := json.Marshal(msg)

	return provider.InboundMessage{
		ExternalID:   fmt.Sprintf("%d", msg.MessageID),
		Sender:       msg.FromUserID,
		Recipient:    msg.ToUserID,
		GroupID:      msg.GroupID,
		Timestamp:    msg.CreateTimeMs,
		MessageState: int(msg.MessageState),
		Items:        items,
		ContextToken: msg.ContextToken,
		SessionID:    msg.SessionID,
		Raw:          raw,
	}
}

func convertItem(item ilink.MessageItem) *provider.MessageItem {
	mi := &provider.MessageItem{}

	switch item.Type {
	case ilink.ItemText:
		if item.TextItem == nil {
			return nil
		}
		mi.Type = "text"
		mi.Text = item.TextItem.Text

	case ilink.ItemImage:
		mi.Type = "image"
		if item.ImageItem != nil {
			mi.Media = convertCDNMedia(item.ImageItem.Media, "image")
			if mi.Media != nil {
				if item.ImageItem.URL != "" {
					mi.Media.URL = item.ImageItem.URL
				}
				mi.Media.ThumbWidth = item.ImageItem.ThumbWidth
				mi.Media.ThumbHeight = item.ImageItem.ThumbHeight
			}
		}

	case ilink.ItemVoice:
		mi.Type = "voice"
		if item.VoiceItem != nil {
			mi.Text = item.VoiceItem.Text
			mi.Media = convertCDNMedia(item.VoiceItem.Media, "voice")
			if mi.Media != nil {
				mi.Media.PlayTime = item.VoiceItem.PlayTime
			}
		}

	case ilink.ItemFile:
		mi.Type = "file"
		if item.FileItem != nil {
			mi.FileName = item.FileItem.FileName
			mi.Media = convertCDNMedia(item.FileItem.Media, "file")
		}

	case ilink.ItemVideo:
		mi.Type = "video"
		if item.VideoItem != nil {
			mi.Media = convertCDNMedia(item.VideoItem.Media, "video")
			if mi.Media != nil {
				mi.Media.FileSize = item.VideoItem.VideoSize
				mi.Media.PlayLength = item.VideoItem.PlayLength
				mi.Media.ThumbWidth = item.VideoItem.ThumbWidth
				mi.Media.ThumbHeight = item.VideoItem.ThumbHeight
			}
		}

	default:
		return nil
	}

	// Convert referenced/quoted message
	if item.RefMsg != nil && item.RefMsg.MessageItem != nil {
		refItem := convertItem(*item.RefMsg.MessageItem)
		if refItem != nil {
			mi.RefMsg = &provider.RefMsg{
				Title: item.RefMsg.Title,
				Item:  *refItem,
			}
		}
	}

	return mi
}

func convertCDNMedia(m *ilink.CDNMedia, mediaType string) *provider.Media {
	if m == nil {
		return nil
	}
	return &provider.Media{
		EncryptQueryParam: m.EncryptQueryParam,
		AESKey:            m.AESKey,
		MediaType:         mediaType,
	}
}

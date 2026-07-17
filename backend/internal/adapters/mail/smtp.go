package mail

import (
	"context"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// SMTPConfig configures a transactional SMTP mailer.
type SMTPConfig struct {
	Host     string
	Port     string
	From     string
	Username string
	Password string
	// Timeout for dial+send (default 10s).
	Timeout time.Duration
}

// SMTP sends mail via net/smtp.
type SMTP struct {
	cfg SMTPConfig
}

// NewSMTP constructs a real SMTP mailer. Host and From are required.
func NewSMTP(cfg SMTPConfig) (*SMTP, error) {
	cfg.Host = strings.TrimSpace(cfg.Host)
	cfg.From = strings.TrimSpace(cfg.From)
	if cfg.Host == "" {
		return nil, fmt.Errorf("mail: SMTP host required")
	}
	if cfg.From == "" {
		return nil, fmt.Errorf("mail: MAIL_FROM required")
	}
	if strings.TrimSpace(cfg.Port) == "" {
		cfg.Port = "587"
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 10 * time.Second
	}
	return &SMTP{cfg: cfg}, nil
}

// Kind returns adapter kind for readiness ("smtp").
func (s *SMTP) Kind() string { return "smtp" }

// Send delivers one message.
func (s *SMTP) Send(ctx context.Context, to, subject, body string) error {
	if s == nil {
		return fmt.Errorf("mail: smtp not configured")
	}
	to = strings.TrimSpace(to)
	if to == "" {
		return fmt.Errorf("mail: recipient required")
	}
	addr := net.JoinHostPort(s.cfg.Host, s.cfg.Port)
	msg := buildMessage(s.cfg.From, to, subject, body)

	type result struct{ err error }
	ch := make(chan result, 1)
	go func() {
		var auth smtp.Auth
		if s.cfg.Username != "" {
			auth = smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)
		}
		ch <- result{err: smtp.SendMail(addr, auth, s.cfg.From, []string{to}, msg)}
	}()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case r := <-ch:
		return r.err
	case <-time.After(s.cfg.Timeout):
		return fmt.Errorf("mail: smtp send timeout")
	}
}

// Ready probes SMTP connectivity with a short dial (no auth secrets logged).
func (s *SMTP) Ready(ctx context.Context) error {
	if s == nil {
		return fmt.Errorf("mail: smtp not configured")
	}
	addr := net.JoinHostPort(s.cfg.Host, s.cfg.Port)
	d := net.Dialer{Timeout: 3 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("mail: smtp dial: %w", err)
	}
	_ = conn.Close()
	return nil
}

func buildMessage(from, to, subject, body string) []byte {
	var b strings.Builder
	b.WriteString("From: ")
	b.WriteString(from)
	b.WriteString("\r\nTo: ")
	b.WriteString(to)
	b.WriteString("\r\nSubject: ")
	b.WriteString(sanitizeHeader(subject))
	b.WriteString("\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n")
	b.WriteString(body)
	return []byte(b.String())
}

func sanitizeHeader(s string) string {
	return strings.Map(func(r rune) rune {
		if r == '\r' || r == '\n' {
			return -1
		}
		return r
	}, s)
}

var _ ports.Mailer = (*SMTP)(nil)

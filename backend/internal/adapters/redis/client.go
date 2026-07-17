// Package redis provides Redis adapters for non-authoritative coordination
// (rate limiting, caches). Financial authority remains in Postgres (ADR-0001).
package redis

import (
	"context"
	"fmt"
	"strings"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

// Client wraps go-redis for Ping and rate limiting.
type Client struct {
	rdb *goredis.Client
}

// Config for Redis connection.
type Config struct {
	URL string
}

// NewClient parses REDIS_URL and returns a connected client.
func NewClient(cfg Config) (*Client, error) {
	url := strings.TrimSpace(cfg.URL)
	if url == "" {
		return nil, fmt.Errorf("redis: URL required")
	}
	opt, err := goredis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("redis: parse url: %w", err)
	}
	rdb := goredis.NewClient(opt)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		_ = rdb.Close()
		return nil, fmt.Errorf("redis: ping: %w", err)
	}
	return &Client{rdb: rdb}, nil
}

// Ping checks connectivity.
func (c *Client) Ping(ctx context.Context) error {
	if c == nil || c.rdb == nil {
		return fmt.Errorf("redis: not configured")
	}
	return c.rdb.Ping(ctx).Err()
}

// Close releases the connection pool.
func (c *Client) Close() error {
	if c == nil || c.rdb == nil {
		return nil
	}
	return c.rdb.Close()
}

// RDB exposes the underlying client for limiter scripts (package-internal).
func (c *Client) RDB() *goredis.Client {
	if c == nil {
		return nil
	}
	return c.rdb
}

// Kind returns adapter kind for readiness.
func (c *Client) Kind() string {
	if c == nil {
		return "noop"
	}
	return "redis"
}

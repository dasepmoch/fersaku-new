// Package catalog owns product and storefront catalog aggregates (BE-210).
// Money is int64 whole IDR only. Public reads expose published products only.
// Storefront publish uses revision/ETag optimistic concurrency (STOREFRONT_REVISION_CONFLICT).
package catalog

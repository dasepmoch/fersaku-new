package objects_test

import (
	"strings"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/objects"
)

func TestBuildObjectKey_ServerOnlyPaths(t *testing.T) {
	key, err := objects.BuildObjectKey(objects.PurposeProductFile, "m1", "s1", "obj1")
	if err != nil {
		t.Fatal(err)
	}
	if key != "private-products/m1/s1/obj1" {
		t.Fatalf("got %q", key)
	}
	pub, err := objects.BuildObjectKey(objects.PurposePublicAsset, "m1", "s1", "obj2")
	if err != nil {
		t.Fatal(err)
	}
	if pub != "public-assets/s1/obj2" {
		t.Fatalf("got %q", pub)
	}
}

func TestBuildObjectKey_RejectsTraversal(t *testing.T) {
	_, err := objects.BuildObjectKey(objects.PurposeProductFile, "m1", "../x", "obj1")
	if err == nil {
		t.Fatal("expected error")
	}
	_, err = objects.BuildObjectKey(objects.PurposeProductFile, "m1", "s1", "a/b")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestParsePurpose_RejectsKYC(t *testing.T) {
	_, err := objects.ParsePurpose("KYC_DOCUMENT")
	if err == nil {
		t.Fatal("expected KYC forbidden")
	}
	if !strings.Contains(err.Error(), "KYC") && err != objects.ErrKYCPresignForbidden {
		// AppError message path
		if err != objects.ErrKYCPresignForbidden {
			t.Fatalf("got %v", err)
		}
	}
}

func TestAllowedContentType(t *testing.T) {
	if !objects.AllowedContentType(objects.PurposePublicAsset, "image/png") {
		t.Fatal("png should be allowed")
	}
	if objects.AllowedContentType(objects.PurposePublicAsset, "application/x-msdownload") {
		t.Fatal("exe not allowed for public")
	}
	if objects.AllowedContentType(objects.PurposeProductFile, "text/html") {
		t.Fatal("html not allowed for product")
	}
}

package architecture_test

import (
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strings"
	"testing"
)

const modulePrefix = "github.com/dasepmoch/fersaku-new/backend"

func TestDomainHasNoInfrastructureImports(t *testing.T) {
	root := filepath.Join("..", "domain")
	assertNoForbidden(t, root, isDomainForbidden)
}

func TestApplicationHasNoAdapterImports(t *testing.T) {
	root := filepath.Join("..", "application")
	assertNoForbidden(t, root, isApplicationForbidden)
}

func isDomainForbidden(imp string) bool {
	switch {
	case imp == "net/http":
		return true
	case strings.HasPrefix(imp, modulePrefix+"/internal/adapters"):
		return true
	case isCompositionRoot(imp):
		return true
	case strings.HasPrefix(imp, "github.com/go-chi/chi"):
		return true
	case strings.HasPrefix(imp, "github.com/jackc/pgx"):
		return true
	case strings.HasPrefix(imp, "github.com/redis/go-redis"):
		return true
	case strings.HasPrefix(imp, "github.com/aws/"):
		return true
	case strings.Contains(imp, "xendit"):
		return true
	default:
		return false
	}
}

func isApplicationForbidden(imp string) bool {
	return strings.HasPrefix(imp, modulePrefix+"/internal/adapters") ||
		isCompositionRoot(imp)
}

// isCompositionRoot matches internal/app (composition root), not internal/application.
func isCompositionRoot(imp string) bool {
	root := modulePrefix + "/internal/app"
	return imp == root || strings.HasPrefix(imp, root+"/")
}

func assertNoForbidden(t *testing.T, root string, forbidden func(string) bool) {
	t.Helper()
	fset := token.NewFileSet()
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") {
			return nil
		}
		file, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if err != nil {
			t.Errorf("parse %s: %v", path, err)
			return nil
		}
		for _, imp := range file.Imports {
			pathLit := strings.Trim(imp.Path.Value, `"`)
			if forbidden(pathLit) {
				t.Errorf("%s imports forbidden package %q", path, pathLit)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk %s: %v", root, err)
	}
}

package inventory_test

import (
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/inventory"
)

func TestValidateSchemaFields(t *testing.T) {
	fields := []inventory.FieldDef{
		{Key: "code", Label: "Code", Secret: true, Required: true, Unique: true},
		{Key: "note", Label: "Note", Secret: false, Required: false},
	}
	if err := inventory.ValidateSchemaFields(fields, ","); err != nil {
		t.Fatal(err)
	}
	cs, err := inventory.SchemaChecksum(fields, ",")
	if err != nil || len(cs) != 64 {
		t.Fatalf("checksum=%s err=%v", cs, err)
	}
}

func TestValidateSchemaRequiresSecret(t *testing.T) {
	err := inventory.ValidateSchemaFields([]inventory.FieldDef{
		{Key: "label", Label: "Label", Secret: false, Required: true},
	}, ",")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestValidateImportRow(t *testing.T) {
	schema := inventory.Schema{
		Fields: []inventory.FieldDef{
			{Key: "code", Label: "Code", Secret: true, Required: true, Unique: true},
			{Key: "pin", Label: "PIN", Secret: true, Required: false},
		},
	}
	norm, uh, err := inventory.ValidateImportRow(schema, map[string]string{"code": "ABC-1", "pin": "12"})
	if err != nil {
		t.Fatal(err)
	}
	if norm["code"] != "ABC-1" || uh == nil {
		t.Fatalf("norm=%v uh=%v", norm, uh)
	}
	masked := inventory.MaskValues(schema, norm)
	if masked["code"] != "***" || masked["pin"] != "***" {
		t.Fatalf("masked=%v", masked)
	}
}

func TestStaleImportUnknownField(t *testing.T) {
	schema := inventory.Schema{
		Fields: []inventory.FieldDef{
			{Key: "code", Label: "Code", Secret: true, Required: true},
		},
	}
	_, _, err := inventory.ValidateImportRow(schema, map[string]string{"code": "x", "extra": "y"})
	if err == nil {
		t.Fatal("expected unknown field error")
	}
}

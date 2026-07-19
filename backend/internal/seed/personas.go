package seed

// Persona describes a deterministic nonprod actor (QLT-110).
type Persona struct {
	Key            string
	UserID         string
	Email          string
	EmailDisplay   string
	Name           string
	Surface        string // BUYER | SELLER | ADMIN
	Roles          []string
	MFAEnabled     bool
	MerchantMember string // OWNER | STAFF | ""
	MerchantID     string
	Notes          string
}

// Personas is the required QLT-110 persona table (stable keys + IDs).
func Personas() []Persona {
	return []Persona{
		{
			Key:          PersonaBuyerA,
			UserID:       ID(IDUserBuyerA),
			Email:        "buyer.a@seed.fersaku.test",
			EmailDisplay: "buyer.a@seed.fersaku.test",
			Name:         "Buyer A Seed",
			Surface:      "BUYER",
			Roles:        []string{"role_buyer"},
			Notes:        "verified; purchases; sessions; notification; eligible review",
		},
		{
			Key:          PersonaBuyerB,
			UserID:       ID(IDUserBuyerB),
			Email:        "buyer.b@seed.fersaku.test",
			EmailDisplay: "buyer.b@seed.fersaku.test",
			Name:         "Buyer B Seed",
			Surface:      "BUYER",
			Roles:        []string{"role_buyer"},
			Notes:        "verified; no ownership over Buyer A purchase",
		},
		{
			Key:            PersonaSellerOwnerA,
			UserID:         ID(IDUserSellerOwnerA),
			Email:          "seller.owner.a@seed.fersaku.test",
			EmailDisplay:   "seller.owner.a@seed.fersaku.test",
			Name:           "Seller Owner A Seed",
			Surface:        "SELLER",
			Roles:          []string{"role_seller_owner"},
			MerchantMember: "OWNER",
			MerchantID:     ID(IDMerchantA),
			Notes:          "completed onboarding; canonical store A; full catalog/commerce/finance",
		},
		{
			Key:            PersonaSellerMemberRead,
			UserID:         ID(IDUserSellerMemberRead),
			Email:          "seller.member.read@seed.fersaku.test",
			EmailDisplay:   "seller.member.read@seed.fersaku.test",
			Name:           "Seller Member Read Seed",
			Surface:        "SELLER",
			Roles:          []string{"role_seller_owner"}, // surface grant; membership is STAFF
			MerchantMember: "STAFF",
			MerchantID:     ID(IDMerchantA),
			Notes:          "same store A; STAFF membership (read isolation actor; schema caps co-evolve INT-150)",
		},
		{
			Key:            PersonaSellerB,
			UserID:         ID(IDUserSellerB),
			Email:          "seller.b@seed.fersaku.test",
			EmailDisplay:   "seller.b@seed.fersaku.test",
			Name:           "Seller B Seed",
			Surface:        "SELLER",
			Roles:          []string{"role_seller_owner"},
			MerchantMember: "OWNER",
			MerchantID:     ID(IDMerchantB),
			Notes:          "foreign merchant/store for isolation tests",
		},
		{
			Key:          PersonaAdminSuper,
			UserID:       ID(IDUserAdminSuper),
			Email:        "admin.super@seed.fersaku.test",
			EmailDisplay: "admin.super@seed.fersaku.test",
			Name:         "Admin Super Seed",
			Surface:      "ADMIN",
			Roles:        []string{"role_super_admin"},
			MFAEnabled:   false,
			Notes:        "SUPER_ADMIN without mandatory MFA (local/demo)",
		},
		{
			Key:          PersonaAdminSupport,
			UserID:       ID(IDUserAdminSupport),
			Email:        "admin.support@seed.fersaku.test",
			EmailDisplay: "admin.support@seed.fersaku.test",
			Name:         "Admin Support Seed",
			Surface:      "ADMIN",
			Roles:        []string{"role_admin_support"},
			Notes:        "bounded read/support permissions",
		},
		{
			Key:          PersonaAdminFinance,
			UserID:       ID(IDUserAdminFinance),
			Email:        "admin.finance@seed.fersaku.test",
			EmailDisplay: "admin.finance@seed.fersaku.test",
			Name:         "Admin Finance Seed",
			Surface:      "ADMIN",
			Roles:        []string{"role_admin_finance"},
			Notes:        "withdrawal/payment permissions only",
		},
		{
			Key:          PersonaAdminNoAccess,
			UserID:       ID(IDUserAdminNoAccess),
			Email:        "admin.noaccess@seed.fersaku.test",
			EmailDisplay: "admin.noaccess@seed.fersaku.test",
			Name:         "Admin No Access Seed",
			Surface:      "ADMIN",
			Roles:        nil,
			Notes:        "authenticated but lacks target admin permission",
		},
	}
}

// PersonaByKey returns a persona or empty.
func PersonaByKey(key string) (Persona, bool) {
	for _, p := range Personas() {
		if p.Key == key {
			return p, true
		}
	}
	return Persona{}, false
}

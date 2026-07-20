// Per-company configuration. The same codebase is built once per company
// (VITE_COMPANY at build time) and each build talks to its own isolated
// Supabase project (VITE_SUPABASE_URL/KEY) — nothing is shared at runtime.
//
// `aol` is the original deployment and MUST keep today's exact values;
// `airocean` is the sister company (Air Ocean Line) — attendance + leaves +
// payroll only, with its own branding.
const COMPANIES = {
  aol: {
    key: "aol",
    name: "Air Ocean Line",
    appTitle: "AOI.",
    opsTitle: "AOI Ops Hub",
    // Client-side fallback only — the live office location comes from the
    // company_locations table via get_my_context_v1.
    location: {
      label: "Air Ocean Line - Alexandria",
      lat: 31.1985266,
      lng: 29.9039409,
      radiusMeters: 1000,
    },
    modules: { companyFinance: true, assistant: true },
  },
  airocean: {
    key: "airocean",
    name: "Air Ocean Line",
    appTitle: "Air Ocean Line",
    opsTitle: "AOL HR Hub",
    // Placeholder (wide radius = no effective geo-fence) until the owner
    // sends the real office pin; the real value lives in company_locations.
    location: {
      label: "Air Ocean Line - Head Office",
      lat: 31.2001,
      lng: 29.9187,
      radiusMeters: 50000,
    },
    modules: { companyFinance: false, assistant: false },
  },
};

export const COMPANY = COMPANIES[import.meta.env.VITE_COMPANY] || COMPANIES.aol;

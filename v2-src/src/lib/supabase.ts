import { createClient } from "@supabase/supabase-js"

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://gdgrdwjlxcavogztvxon.supabase.co"

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkZ3Jkd2pseGNhdm9nenR2eG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MTA4MDgsImV4cCI6MjA5ODM4NjgwOH0.fu5-nWn7Ztugqop_bA-VsNmwtN750pyv1QjWLlTODxw"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export interface GeoPoint {
  lat: number
  lng: number
}

export interface CompanyLocation extends GeoPoint {
  label: string
  radiusMeters: number
}

export const COMPANY_LOCATION: CompanyLocation = {
  label: "Air Ocean Line - Alexandria",
  lat: 31.1984542,
  lng: 29.9038747,
  radiusMeters: 50,
}

export function distanceMeters(a: GeoPoint, b: GeoPoint) {
  const earth = 6371000
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earth * Math.asin(Math.sqrt(h))
}

export function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date())
}

export function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7)
}

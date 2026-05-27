import type { BrandType, FeatureKind, StructureSubtype } from "~/types"

export type AppIconName =
  | 'mall' | 'shop' | 'office' | 'residential' | 'park' | 'school' | 'road' | 'river' | 'other'
  | 'owner' | 'customer' | 'both'
  | 'poi' | 'score' | 'influence' | 'spend' | 'topic'
  | 'scenario' | 'entity' | 'brand'
  | 'draw' | 'select' | 'layer' | 'district'
  | 'check' | 'warning'

const SUBTYPE_ICONS: Record<StructureSubtype, AppIconName> = {
  mall: 'mall',
  shop: 'shop',
  office: 'office',
  residential: 'residential',
  park: 'park',
  school: 'school',
  road: 'road',
  river: 'river',
  other: 'other',
}

const SUBTYPE_LABELS: Record<StructureSubtype, string> = {
  mall: 'Mall',
  shop: 'Shop',
  office: 'Office',
  residential: 'Residential',
  park: 'Park',
  school: 'School',
  road: 'Road',
  river: 'River',
  other: 'Other',
}

const BRAND_TYPE_ICONS: Record<BrandType, AppIconName> = {
  owner: 'owner',
  customer: 'customer',
  both: 'both',
}

const BRAND_TYPE_LABELS: Record<BrandType, string> = {
  owner: 'Owner',
  customer: 'Customer',
  both: 'Both',
}

const KIND_ICONS: Record<FeatureKind, AppIconName> = {
  parcel_residential: 'residential',
  parcel_commercial: 'mall',
  parcel_mixed: 'other',
  residential: 'residential',
  commercial: 'mall',
  road: 'road',
  poi: 'poi',
}

const KIND_LABELS: Record<FeatureKind, string> = {
  parcel_residential: 'Residential Parcel',
  parcel_commercial: 'Commercial Parcel',
  parcel_mixed: 'Mixed-Use Parcel',
  residential: 'Residential Area',
  commercial: 'Commercial Area',
  road: 'Road',
  poi: 'POI',
}

const SUBTYPE_COLORS: Record<StructureSubtype, string> = {
  mall: 'text-amber-600 bg-amber-50',
  shop: 'text-pink-600 bg-pink-50',
  office: 'text-indigo-600 bg-indigo-50',
  residential: 'text-orange-600 bg-orange-50',
  park: 'text-green-600 bg-green-50',
  school: 'text-emerald-600 bg-emerald-50',
  road: 'text-slate-600 bg-slate-100',
  river: 'text-cyan-600 bg-cyan-50',
  other: 'text-gray-500 bg-gray-100',
}

const BRAND_TYPE_COLORS: Record<BrandType, string> = {
  owner: 'text-amber-700 bg-amber-100',
  customer: 'text-blue-700 bg-blue-100',
  both: 'text-purple-700 bg-purple-100',
}

export function subtypeIcon(subtype: string): AppIconName {
  return SUBTYPE_ICONS[subtype as StructureSubtype] ?? 'other'
}

export function subtypeLabel(subtype: string): string {
  return SUBTYPE_LABELS[subtype as StructureSubtype] ?? subtype
}

export function subtypeColor(subtype: string): string {
  return SUBTYPE_COLORS[subtype as StructureSubtype] ?? 'text-gray-500 bg-gray-100'
}

export function brandTypeIcon(type?: BrandType): AppIconName {
  return BRAND_TYPE_ICONS[type as BrandType] ?? 'brand'
}

export function brandTypeLabel(type?: BrandType | string): string {
  if (!type) return ''
  return BRAND_TYPE_LABELS[type as BrandType] ?? type
}

export function brandTypeColor(type?: BrandType | string): string {
  if (!type) return ''
  return BRAND_TYPE_COLORS[type as BrandType] ?? 'text-gray-600 bg-gray-100'
}

export function kindIcon(kind: string): AppIconName {
  return KIND_ICONS[kind as FeatureKind] ?? 'other'
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind as FeatureKind] ?? kind
}

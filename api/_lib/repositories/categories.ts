import { getSupabaseAdmin } from '../supabase.js'

export interface Category {
  id: string
  profile_id: string
  label: string
  sort_order: number
  source: 'seed' | 'ai_created'
  created_via: string | null
  created_at: string
}

export async function listCategories(profileId: string): Promise<Category[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('categories').select('*').eq('profile_id', profileId).order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as Category[]
}

/** Simple, readable slug — "Gifts & Subscriptions" -> "gifts_subscriptions". Collides are disambiguated with a numeric suffix. */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export async function createCategory(profileId: string, label: string): Promise<Category> {
  const supabase = getSupabaseAdmin()
  const existing = await listCategories(profileId)
  const base = slugify(label) || 'category'
  let id = base
  let suffix = 2
  while (existing.some((c) => c.id === id)) {
    id = `${base}_${suffix}`
    suffix++
  }
  const sort_order = existing.length > 0 ? Math.max(...existing.map((c) => c.sort_order)) + 1 : 1
  const { data, error } = await supabase
    .from('categories')
    .insert({ id, profile_id: profileId, label, sort_order, source: 'ai_created' })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not create category')
  return data as Category
}

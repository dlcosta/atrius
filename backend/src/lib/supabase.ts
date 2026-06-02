import { createClient as _createClient, SupabaseClient } from '@supabase/supabase-js'

type SupabaseFactory = () => SupabaseClient

function defaultFactory(): SupabaseClient {
  return _createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

let factory: SupabaseFactory = defaultFactory

export function createClient(): SupabaseClient {
  return factory()
}

// Hooks de teste: permitem injetar um cliente Supabase falso sem tocar nas rotas,
// que continuam chamando createClient() normalmente.
export function __setSupabaseFactoryForTests(f: SupabaseFactory): void {
  factory = f
}

export function __resetSupabaseFactory(): void {
  factory = defaultFactory
}

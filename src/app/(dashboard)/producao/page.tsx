import { createClient } from '@/lib/supabase/server'
import { ProducaoCalendar } from '@/components/producao/ProducaoCalendar'
import type { Ordem, Tanque, Turno } from '@/types'

async function buscarOrdens(): Promise<Ordem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ordens')
    .select('*')
    .eq('etapa', 'tanque')
    .in('planning_status', ['BACKLOG', 'SCHEDULED', 'IN_PRODUCTION'])
  if (error) {
    console.error('[producao] erro ao buscar ordens:', error.message)
    return []
  }
  return (data as Ordem[]) ?? []
}

async function buscarTanques(): Promise<Tanque[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tanques')
    .select('*')
    .eq('ativo', true)
    .order('volume_liters', { ascending: true })
  if (error) return []
  return (data as Tanque[]) ?? []
}

async function buscarTurnos(): Promise<Turno[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('turnos')
    .select('*')
    .eq('ativo', true)
    .order('hora_inicio', { ascending: true })
  if (error) return []
  return (data as Turno[]) ?? []
}

export default async function ProducaoPage() {
  const [ordens, tanques, turnos] = await Promise.all([buscarOrdens(), buscarTanques(), buscarTurnos()])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ProducaoCalendar ordens={ordens} tanques={tanques} turnos={turnos} />
    </div>
  )
}

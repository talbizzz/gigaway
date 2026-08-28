import { useQuery } from '@tanstack/react-query'

import type { City } from '@/components/city-picker'
import { supabase } from '@/lib/supabase'

/**
 * One city by id.
 *
 * The picker only ever hands back an id, so every screen that shows a stored
 * city has to resolve it back to a name. Kept in one place because the selected
 * column list has to match `City` exactly — a screen that forgets `population`
 * type-checks against a partial row and fails at the picker instead.
 */
export function useCity(cityId: string | null | undefined) {
  return useQuery({
    queryKey: ['cities', 'byId', cityId],
    enabled: Boolean(cityId),
    queryFn: async (): Promise<City> => {
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, name_local, country_code, population')
        .eq('id', cityId!)
        .single()
      if (error) throw error
      return data
    },
  })
}

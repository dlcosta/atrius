// Fake Supabase em memória para testes de integração das rotas.
// Cobre o subconjunto da API do query-builder usado pelas rotas: from/select/eq/neq/in/not/is/
// gte/lte/order/maybeSingle/single/insert/update, além de ser "thenable" (await retorna {data,error}).
//
// Documenta, na prática, o contrato do qual as rotas dependem. NÃO é uma reimplementação fiel do
// PostgREST — só o necessário para exercitar os fluxos testados.

type Row = Record<string, any>
export type Tables = Record<string, Row[]>

type Filter = (row: Row) => boolean

class FakeQuery implements PromiseLike<{ data: any; error: any }> {
  private filters: Filter[] = []
  private orderBy: { col: string; asc: boolean } | null = null
  private mode: 'select' | 'insert' | 'update' = 'select'
  private patch: Row | null = null
  private insertRows: Row[] = []

  constructor(private rows: Row[]) {}

  select(_cols?: string): this {
    return this
  }

  eq(col: string, val: any): this {
    this.filters.push((r) => r[col] === val)
    return this
  }

  neq(col: string, val: any): this {
    this.filters.push((r) => r[col] !== val)
    return this
  }

  in(col: string, vals: any[]): this {
    this.filters.push((r) => vals.includes(r[col]))
    return this
  }

  is(col: string, val: null): this {
    this.filters.push((r) => (r[col] ?? null) === val)
    return this
  }

  not(col: string, op: string, val: null): this {
    if (op === 'is' && val === null) {
      this.filters.push((r) => (r[col] ?? null) !== null)
    }
    return this
  }

  gte(col: string, val: any): this {
    this.filters.push((r) => r[col] != null && r[col] >= val)
    return this
  }

  lte(col: string, val: any): this {
    this.filters.push((r) => r[col] != null && r[col] <= val)
    return this
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy = { col, asc: opts?.ascending !== false }
    return this
  }

  insert(rows: Row | Row[]): this {
    this.mode = 'insert'
    this.insertRows = Array.isArray(rows) ? rows : [rows]
    return this
  }

  update(patch: Row): this {
    this.mode = 'update'
    this.patch = patch
    return this
  }

  private matched(): Row[] {
    return this.rows.filter((r) => this.filters.every((f) => f(r)))
  }

  private resolveList(): { data: any; error: any } {
    if (this.mode === 'insert') {
      for (const row of this.insertRows) this.rows.push(row)
      return { data: this.insertRows, error: null }
    }
    if (this.mode === 'update') {
      const matched = this.matched()
      for (const row of matched) Object.assign(row, this.patch)
      return { data: matched, error: null }
    }
    let data = this.matched()
    if (this.orderBy) {
      const { col, asc } = this.orderBy
      data = [...data].sort((a, b) => {
        const av = a[col] ?? null
        const bv = b[col] ?? null
        if (av === bv) return 0
        if (av === null) return 1
        if (bv === null) return -1
        return (av < bv ? -1 : 1) * (asc ? 1 : -1)
      })
    }
    return { data, error: null }
  }

  async maybeSingle(): Promise<{ data: any; error: any }> {
    const { data } = this.resolveList()
    return { data: data[0] ?? null, error: null }
  }

  async single(): Promise<{ data: any; error: any }> {
    const { data } = this.resolveList()
    if (!data[0]) return { data: null, error: { message: 'No rows found' } }
    return { data: data[0], error: null }
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolveList()).then(onfulfilled, onrejected)
  }
}

export function createFakeSupabase(tables: Tables) {
  const store: Tables = {}
  for (const [name, rows] of Object.entries(tables)) {
    store[name] = rows.map((r) => ({ ...r }))
  }
  const client = {
    from(table: string) {
      if (!store[table]) store[table] = []
      return new FakeQuery(store[table])
    },
    // expõe o estado para asserções nos testes
    __tables: store,
  }
  return client as any
}

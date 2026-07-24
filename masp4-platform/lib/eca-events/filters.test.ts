import { describe, it, expect } from 'vitest'
import { parseFilters, filtersToQuery, EQ_COLUMNS } from './filters'

describe('parseFilters', () => {
  it('defaults to real-only (includeTest false) and empty filters', () => {
    const f = parseFilters({})
    expect(f.includeTest).toBe(false)
    expect(f.country).toBeUndefined()
  })

  it('reads includeTest only when exactly "1"', () => {
    expect(parseFilters({ includeTest: '1' }).includeTest).toBe(true)
    expect(parseFilters({ includeTest: 'true' }).includeTest).toBe(false)
    expect(parseFilters({ includeTest: '0' }).includeTest).toBe(false)
  })

  it('collapses array search params to the first value', () => {
    expect(parseFilters({ country: ['Kenya', 'Uganda'] }).country).toBe('Kenya')
  })

  it('parses the full filter set', () => {
    const f = parseFilters({
      from: '2024-01-01', to: '2024-12-31', country: 'Kenya', admin1: 'Bungoma',
      admin2: 'Kimilili', project: 'CSV Maize', commodity: 'Maize',
      eventType: 'Training', trainingType: 'Field day', includeTest: '1',
    })
    expect(f).toEqual({
      from: '2024-01-01', to: '2024-12-31', country: 'Kenya', admin1: 'Bungoma',
      admin2: 'Kimilili', project: 'CSV Maize', commodity: 'Maize',
      eventType: 'Training', trainingType: 'Field day', includeTest: true,
    })
  })
})

describe('filtersToQuery round-trip', () => {
  it('re-parses to the same filters', () => {
    const original = parseFilters({ country: 'Uganda', project: 'ICAM', from: '2025-06-01', includeTest: '1' })
    const qs = filtersToQuery(original)
    const round = parseFilters(Object.fromEntries(new URLSearchParams(qs)))
    expect(round).toEqual(original)
  })

  it('omits empty/false values from the query string', () => {
    expect(filtersToQuery(parseFilters({}))).toBe('')
    expect(filtersToQuery(parseFilters({ country: 'Kenya' }))).toBe('country=Kenya')
  })
})

describe('EQ_COLUMNS mapping', () => {
  it('maps every equality filter key to a safe-view column', () => {
    const keys = EQ_COLUMNS.map(([k]) => k)
    expect(keys).toEqual(['country', 'admin1', 'admin2', 'project', 'commodity', 'eventType', 'trainingType'])
    expect(EQ_COLUMNS.find(([k]) => k === 'country')?.[1]).toBe('country_label')
  })
})

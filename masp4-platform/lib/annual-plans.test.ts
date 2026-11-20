import { describe, it, expect } from 'vitest'
import { parsePlanLink, planOpenUrl } from './annual-plans'

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'

describe('parsePlanLink', () => {
  it('reads Google Docs, Sheets and Slides links and their type', () => {
    expect(parsePlanLink(`https://docs.google.com/document/d/${ID}/edit?usp=sharing`))
      .toEqual({ id: ID, url: `https://docs.google.com/document/d/${ID}/edit`, type: 'gdoc' })
    expect(parsePlanLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)?.type).toBe('gsheet')
    expect(parsePlanLink(`https://docs.google.com/presentation/u/1/d/${ID}/edit`)?.type).toBe('gslides')
  })

  it('reads Drive file links without a type', () => {
    expect(parsePlanLink(`https://drive.google.com/file/d/${ID}/view?usp=drive_link`))
      .toEqual({ id: ID, url: `https://drive.google.com/file/d/${ID}/view`, type: null })
    expect(parsePlanLink(`https://drive.google.com/open?id=${ID}`)?.id).toBe(ID)
  })

  it('rejects folders, other sites and plain http', () => {
    expect(parsePlanLink(`https://drive.google.com/drive/folders/${ID}`)).toBeNull()
    expect(parsePlanLink(`https://example.com/document/d/${ID}`)).toBeNull()
    expect(parsePlanLink(`http://docs.google.com/document/d/${ID}/edit`)).toBeNull()
    expect(parsePlanLink('not a link')).toBeNull()
  })
})

describe('planOpenUrl', () => {
  it('opens Office files in the matching Google viewer and keeps native links', () => {
    expect(planOpenUrl({ drive_file_id: ID, source_url: 'x', file_type: 'xlsx' })).toContain(`/spreadsheets/d/${ID}/edit?rtpof=true`)
    expect(planOpenUrl({ drive_file_id: ID, source_url: 'x', file_type: 'docx' })).toContain(`/document/d/${ID}/edit?rtpof=true`)
    expect(planOpenUrl({ drive_file_id: ID, source_url: 'x', file_type: 'pptx' })).toContain(`/presentation/d/${ID}/edit?rtpof=true`)
    expect(planOpenUrl({ drive_file_id: ID, source_url: 'native', file_type: 'gsheet' })).toBe('native')
    expect(planOpenUrl({ drive_file_id: ID, source_url: 'native', file_type: 'pdf' })).toBe('native')
  })
})

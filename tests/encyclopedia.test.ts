import { describe, expect, it } from 'vitest'
import { entityTextSegments, type ReaderEntity } from '../shared/utils/encyclopedia'

const entities: ReaderEntity[] = [
  { id: 'lin', type: 'CHARACTER', originalName: '林默', translatedName: 'Lin Mo', aliases: ['Young Master Lin'], description: '' },
  { id: 'river', type: 'PLACE', originalName: '青河', translatedName: 'Azure River', aliases: [], description: '' }
]

describe('entityTextSegments', () => {
  it('annotates Chinese names and translated aliases', () => {
    expect(entityTextSegments('林默 crossed the Azure River.', entities).filter(part => part.entity).map(part => part.entity?.id)).toEqual(['lin', 'river'])
  })

  it('does not match translated names inside larger words', () => {
    expect(entityTextSegments('The Lin Model was revised.', entities).some(part => part.entity)).toBe(false)
  })

  it('prefers the longest alias at the same position', () => {
    const result = entityTextSegments('Young Master Lin arrived.', entities)
    expect(result.find(part => part.entity)?.text).toBe('Young Master Lin')
  })
})

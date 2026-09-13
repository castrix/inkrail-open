import { describe, expect, it } from 'vitest'
import { dictionaryBatchSize, validateDictionaryBatch } from '../server/services/dictionary-batch'

describe('dictionary batches', () => {
  it('bounds batches and permits a one-chapter control setting', () => {
    expect(dictionaryBatchSize('3')).toBe(3)
    expect(dictionaryBatchSize('1')).toBe(1)
    expect(dictionaryBatchSize('100')).toBe(5)
    expect(dictionaryBatchSize('-2')).toBe(1)
    expect(dictionaryBatchSize('invalid')).toBe(3)
  })
  it('accepts per-chapter empty results and out-of-order responses', () => {
    expect(validateDictionaryBatch({ chapters: [{ chapterId: 'b', entities: [] }, { chapterId: 'a', entities: [] }] }, ['a', 'b']).chapters).toHaveLength(2)
  })
  it('rejects missing, duplicate, or unrelated chapter results before saving any chapter', () => {
    for (const ids of [['a'], ['a', 'a'], ['a', 'wrong']]) {
      expect(() => validateDictionaryBatch({ chapters: ids.map(chapterId => ({ chapterId, entities: [] })) }, ['a', 'b'])).toThrow()
    }
  })
  it('requires physical and identity descriptions for every returned entity', () => {
    expect(() => validateDictionaryBatch({ chapters: [{ chapterId: 'a', entities: [{ type: 'CHARACTER', originalName: '林默' }] }] }, ['a'])).toThrow()
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { useFreshDatabase } from './fresh-database.js'
import { saveCourse } from '../../src/data/courses.js'
import { saveRecording } from '../../src/data/recordings.js'
import {
  deleteMoment,
  getMoment,
  listMomentsForRecording,
  saveMoment,
} from '../../src/data/moments.js'

const moment = {
  id: 'm1',
  recordingId: 'week9',
  atSeconds: 754,
  label: 'Coding example',
  color: 'teal',
}

beforeEach(async () => {
  await useFreshDatabase()
  await saveCourse({
    id: 'hcim605',
    code: 'HCIM 605',
    name: 'Qualitative Research Methods',
    color: 'indigo',
  })
  await saveRecording({ id: 'week9', title: 'Week 9', courseId: 'hcim605' })
  await saveRecording({ id: 'week8', title: 'Week 8', courseId: 'hcim605' })
})

describe('moments', () => {
  it('saves a moment and reads it back', async () => {
    await saveMoment(moment)
    expect(await getMoment('m1')).toEqual(moment)
  })

  it('gives a moment without an id a new uuid', async () => {
    const saved = await saveMoment({ ...moment, id: undefined })
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('lists one recording through the recordingId index, earliest first', async () => {
    await saveMoment({ ...moment, id: 'late', atSeconds: 3000 })
    await saveMoment({ ...moment, id: 'early', atSeconds: 0 })
    await saveMoment({ ...moment, id: 'other', recordingId: 'week8' })
    expect((await listMomentsForRecording('week9')).map((stored) => stored.id)).toEqual([
      'early',
      'late',
    ])
    expect(await listMomentsForRecording('week8')).toHaveLength(1)
  })

  it('deletes a moment', async () => {
    await saveMoment(moment)
    await deleteMoment('m1')
    expect(await getMoment('m1')).toBeUndefined()
  })

  it('rejects a moment with negative atSeconds', async () => {
    await expect(saveMoment({ ...moment, atSeconds: -1 })).rejects.toThrow(RangeError)
    await expect(saveMoment({ ...moment, atSeconds: -1 })).rejects.toThrow(
      'moment m1 atSeconds must be a finite number of 0 or more, got -1'
    )
    expect(await getMoment('m1')).toBeUndefined()
  })

  it.each([
    [{ ...moment, label: '' }, /label must be a non empty string/],
    [{ ...moment, color: 'blue' }, /color must be one of indigo, teal, orange, pink, got blue/],
    [{ ...moment, atSeconds: Number.POSITIVE_INFINITY }, /atSeconds must be a finite number/],
    [{ ...moment, recordingId: 'missing' }, /points to recording missing, which does not exist/],
  ])('rejects %j', async (input, message) => {
    await expect(saveMoment(input)).rejects.toThrow(message)
    expect(await getMoment('m1')).toBeUndefined()
  })
})

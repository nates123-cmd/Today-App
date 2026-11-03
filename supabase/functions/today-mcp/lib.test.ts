// deno test supabase/functions/today-mcp/lib.test.ts
import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { localISO, resolveDate, parseHour, fmtHour, pillarTagToId, freeWindows } from './lib.ts'

Deno.test('localISO uses New York, not UTC', () => {
  // 2026-11-03 01:30 UTC = Nov 2, 8:30 PM EST. UTC slicing would say Nov 3.
  const evening = new Date('2026-11-03T01:30:00Z')
  assertEquals(localISO(0, evening), '2026-11-02')
  assertEquals(localISO(1, evening), '2026-11-03')
  // Month rollover.
  assertEquals(localISO(1, new Date('2026-11-30T15:00:00Z')), '2026-12-01')
})

Deno.test('resolveDate', () => {
  assertEquals(resolveDate('2026-11-03'), '2026-11-03')
  assertThrows(() => resolveDate('next tuesday'))
})

Deno.test('parseHour accepts the usual spellings', () => {
  assertEquals(parseHour('9:30'), 9.5)
  assertEquals(parseHour('9:30am'), 9.5)
  assertEquals(parseHour('2pm'), 14)
  assertEquals(parseHour('2:15 PM'), 14.25)
  assertEquals(parseHour('12pm'), 12)
  assertEquals(parseHour('12am'), 0)
  assertEquals(parseHour('14:00'), 14)
  assertEquals(parseHour(11.25), 11.25)
  assertThrows(() => parseHour('25:00'))
  assertThrows(() => parseHour('soon'))
})

Deno.test('fmtHour', () => {
  assertEquals(fmtHour(9.5), '9:30 AM')
  assertEquals(fmtHour(12), '12:00 PM')
  assertEquals(fmtHour(0), '12:00 AM')
  assertEquals(fmtHour(16.25), '4:15 PM')
})

Deno.test('pillarTagToId mirrors usePillars', () => {
  assertEquals(pillarTagToId('Arrow'), 'arrow')
  assertEquals(pillarTagToId('Side gig'), 'sidegig')
  assertEquals(pillarTagToId('Sunny Day'), 'sunny')
  assertEquals(pillarTagToId('Open Tasks'), 'open')
  assertEquals(pillarTagToId('Unfiled'), null)
})

Deno.test('freeWindows around a 10-11 meeting', () => {
  const free = freeWindows([{ hour: 10, duration_minutes: 60 }], 9, 13)
  assertEquals(free, [
    { start: '9:00 AM', end: '10:00 AM', minutes: 60 },
    { start: '11:00 AM', end: '1:00 PM', minutes: 120 },
  ])
})

Deno.test('freeWindows: overlapping blocks, block before window, tiny gaps dropped', () => {
  const free = freeWindows([
    { hour: 6, duration_minutes: 60 },      // before window
    { hour: 9, duration_minutes: 90 },      // 9-10:30
    { hour: 10, duration_minutes: 60 },     // 10-11, overlaps
    { hour: 11.1, duration_minutes: 60 },   // 6-minute gap after 11 is dropped
  ], 8, 14)
  assertEquals(free, [
    { start: '8:00 AM', end: '9:00 AM', minutes: 60 },
    { start: '12:06 PM', end: '2:00 PM', minutes: 114 },
  ])
})

Deno.test('freeWindows: empty day is one window', () => {
  assertEquals(freeWindows([], 7, 22), [{ start: '7:00 AM', end: '10:00 PM', minutes: 900 }])
})

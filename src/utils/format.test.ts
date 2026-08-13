import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { timeAgo, timeAgoLabel } from './format';

/**
 * Pinned so "past a week" is a fact about the input rather than about the day
 * the suite happens to run. The boundary these tests care about - the switch
 * from a duration to a calendar date - is only reachable with a fixed clock.
 */
const NOW = Date.parse('2026-08-13T12:00:00Z');

const minutes = (n: number) => NOW - n * 60_000;
const hours = (n: number) => NOW - n * 3_600_000;
const days = (n: number) => NOW - n * 86_400_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('timeAgo', () => {
  it('reports seconds as "just now"', () => {
    expect(timeAgo(NOW - 5_000)).toBe('just now');
  });

  it('reports durations compactly', () => {
    expect(timeAgo(minutes(4))).toBe('4m');
    expect(timeAgo(hours(2))).toBe('2h');
    expect(timeAgo(days(3))).toBe('3d');
  });

  it('switches to a calendar date past a week', () => {
    // The case the label bug hinged on: this is a date, not a duration.
    expect(timeAgo(days(7))).toBe('Aug 6');
    expect(timeAgo(days(14))).toBe('Jul 30');
  });
});

describe('timeAgoLabel', () => {
  it('appends "ago" to durations', () => {
    expect(timeAgoLabel(minutes(4))).toBe('4m ago');
    expect(timeAgoLabel(hours(2))).toBe('2h ago');
    expect(timeAgoLabel(days(6))).toBe('6d ago');
  });

  it('leaves "just now" alone', () => {
    expect(timeAgoLabel(NOW - 5_000)).toBe('just now');
  });

  /**
   * The regression. Callers used to write `${timeAgo(ts)} ago`, which produced
   * "Aug 6 ago" and "Jul 30 ago" in the notifications list for anything older
   * than a week.
   */
  it('never appends "ago" to a date', () => {
    expect(timeAgoLabel(days(7))).toBe('Aug 6');
    expect(timeAgoLabel(days(14))).toBe('Jul 30');
    expect(timeAgoLabel(days(60))).not.toMatch(/ago/);
  });
});

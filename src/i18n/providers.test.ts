import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestTranslations } from './providers';

/**
 * These pin the two behaviours that decide whether a bad response reaches the
 * screen. Everything else in this module is plumbing; these are the parts that
 * could put nonsense in front of a user.
 */

const respond = (body: unknown, ok = true) =>
  Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  } as Response);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestTranslations (MyMemory path)', () => {
  it('returns a translation for each requested string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        respond({
          responseStatus: 200,
          responseData: { translatedText: 'Crear evento' },
        }),
      ),
    );

    const out = await requestTranslations(['Create Event'], 'es');
    expect(out.get('Create Event')).toBe('Crear evento');
  });

  it('discards the shouty error strings MyMemory returns with a 200', async () => {
    /*
     * The real failure mode this guards. Asking for an unsupported language
     * gets HTTP 200 with a body of
     * "'ZT' IS AN INVALID TARGET LANGUAGE . EXAMPLE: LANGPAIR=EN|IT" - which,
     * taken at face value, would be rendered as the button's label.
     */
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        respond({
          responseStatus: 200,
          responseData: {
            translatedText:
              "'ZT' IS AN INVALID TARGET LANGUAGE . EXAMPLE: LANGPAIR=EN|IT",
          },
        }),
      ),
    );

    const out = await requestTranslations(['Tickets'], 'zt');
    expect(out.size).toBe(0);
  });

  it('stops the whole run once the daily quota is spent', async () => {
    /*
     * Continuing would fail identically for every remaining string and is how
     * an IP gets blocked rather than merely throttled.
     */
    const fetchMock = vi.fn(() =>
      respond({ quotaFinished: true, responseData: { translatedText: '' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await requestTranslations(
      ['One', 'Two', 'Three', 'Four', 'Five', 'Six'],
      'es',
    );

    expect(out.size).toBe(0);
    // Four workers each see the quota flag once and stop; none of them loops on
    // to a second string.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('survives a network failure without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    await expect(requestTranslations(['Tickets'], 'es')).resolves.toEqual(
      new Map(),
    );
  });

  it('does nothing for an empty batch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const out = await requestTranslations([], 'es');
    expect(out.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

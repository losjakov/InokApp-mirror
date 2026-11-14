import { describe, expect, it } from 'vitest';
import { classifySyncFailure } from '@/data/syncFailure';
import { ApiError } from '@/data/api/client';
import { ChecksumError } from '@/data/api/exportLoader';
import { ImportError } from '@/data/db/import';

const UA = (v: number) => `Mozilla/5.0 (Linux; Android 8.0.0; G3412; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/${v}.0.4758.87 Mobile Safari/537.36`;
const ok = UA(98); // the reference phone (A-47)

describe('A-46 (3): the first-run screen tells the cause apart, with a short code', () => {
  it('the field case of 04.11 (manifest -> 403 without the key on a working network) is a SERVER answer, not «no internet»', () => {
    expect(classifySyncFailure(new ApiError(403, 'http_403'), true, ok)).toEqual({ kind: 'server', code: 'HTTP-403' });
    expect(classifySyncFailure(new ApiError(403, 'bad_key'), true, ok)).toEqual({ kind: 'server', code: 'HTTP-403 bad_key' });
    expect(classifySyncFailure(new ApiError(503, 'http_503'), false, ok).kind).toBe('server'); // an answer came: the server, whatever the flag says
  });
  it('no network = offline; online without an answer = network (timeout / refused)', () => {
    expect(classifySyncFailure(new TypeError('Failed to fetch'), false, ok)).toEqual({ kind: 'offline', code: 'NET-OFF' });
    expect(classifySyncFailure(new DOMException('The operation was aborted.', 'AbortError'), true, ok)).toEqual({ kind: 'network', code: 'NET-TIMEOUT' });
    expect(classifySyncFailure(new TypeError('Failed to fetch'), true, ok)).toEqual({ kind: 'network', code: 'NET-FAIL' });
  });
  it('the file came but could not be checked or written = import', () => {
    expect(classifySyncFailure(new ChecksumError('sha256 a != b'), true, ok)).toEqual({ kind: 'import', code: 'IMP-SHA' });
    expect(classifySyncFailure(new ImportError('required', 'x'), true, ok)).toEqual({ kind: 'import', code: 'IMP-REQUIRED' });
    expect(classifySyncFailure(new RangeError('sqlite'), true, ok)).toEqual({ kind: 'import', code: 'ERR-RangeError' });
  });
  it('an engine below the floor wins over everything (its own text: update WebView / Chrome)', () => {
    expect(classifySyncFailure(new TypeError('AbortSignal.timeout is not a function'), true, UA(70), 89)).toEqual({ kind: 'engine', code: 'ENG-70' });
    expect(classifySyncFailure(new ApiError(403, 'http_403'), true, UA(88), 89).kind).toBe('engine');
    expect(classifySyncFailure(new ApiError(403, 'http_403'), true, UA(89), 89).kind).toBe('server');
    expect(classifySyncFailure(new TypeError('x'), true, 'Mozilla/5.0 (iPhone) Safari/604.1', 89).kind).toBe('import'); // not Chromium: no engine verdict
  });
});

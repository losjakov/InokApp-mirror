import { describe, expect, it } from 'vitest';
import { syncVersionTopic, versionTopicName } from '@/native/push';
import { versionCode } from '@/app/version';

// cloud_41 (A-132, contract §4): the app listens to the topic of ITS version only (1.0.15 = appv_10015) and drops an earlier one it kept
const fakes = (kept: string | null, fail = false) => {
  const calls: string[] = []; let v = kept;
  return { calls, get value() { return v; },
    api: { subscribe: async (o: { topic: string }) => { if (fail) throw new Error('offline'); calls.push(`+${o.topic}`); }, unsubscribe: async (o: { topic: string }) => { calls.push(`-${o.topic}`); } },
    kept: { get: async () => ({ value: v }), set: async (o: { value: string }) => { v = o.value; } } };
};

describe('push topic of the version (appv_<code>)', () => {
  it('the name: appv_ + the versionCode (A-62)', () => {
    expect(versionTopicName(10015)).toBe('appv_10015');
    expect(versionTopicName()).toBe(`appv_${versionCode()}`);
  });
  it('first time: subscribed, remembered', async () => {
    const f = fakes(null);
    expect(await syncVersionTopic(f.api, f.kept, 10015)).toBe(true);
    expect(f.calls).toEqual(['+appv_10015']);
    expect(f.value).toBe('appv_10015');
  });
  it('after an update: the new one in, the earlier version\'s out', async () => {
    const f = fakes('appv_10015');
    await syncVersionTopic(f.api, f.kept, 10016);
    expect(f.calls).toEqual(['+appv_10016', '-appv_10015']);
    expect(f.value).toBe('appv_10016');
  });
  it('a failure (offline) leaves nothing remembered - asked again later', async () => {
    const f = fakes(null, true);
    expect(await syncVersionTopic(f.api, f.kept, 10015)).toBe(false);
    expect(f.value).toBeNull();
  });
});

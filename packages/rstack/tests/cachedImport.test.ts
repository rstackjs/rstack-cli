import { expect, rs, test } from 'rstack/test';
import { cachedImport } from '../src/cachedImport.ts';

test('loads lazily and shares pending and fulfilled imports', async () => {
  const module = { value: 1 };
  const importer = rs.fn(() => Promise.resolve(module));
  const load = cachedImport(importer);

  expect(importer).not.toHaveBeenCalled();
  const pending = load();
  expect(load()).toBe(pending);
  await expect(pending).resolves.toBe(module);
  await expect(load()).resolves.toBe(module);
  expect(importer).toHaveBeenCalledTimes(1);
});

test('allows retrying a failed import', async () => {
  const error = new Error('Failed to load module');
  const module = { value: 1 };
  const importer = rs
    .fn<() => Promise<typeof module>>()
    .mockRejectedValueOnce(error)
    .mockResolvedValue(module);
  const load = cachedImport(importer);

  await expect(load()).rejects.toBe(error);
  await expect(load()).resolves.toBe(module);
  await expect(load()).resolves.toBe(module);
  expect(importer).toHaveBeenCalledTimes(2);
});

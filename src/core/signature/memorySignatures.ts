import { checkSignature, normalizeSignature, type EmailSignature, type SignatureBackend } from "./types";

/** Signatures kept in memory for preview mode and tests. Follows the same rules as the database. */
export function memorySignatures(seed: EmailSignature[] = []) {
  const store = new Map(seed.map((s) => [s.profileId, structuredClone(s)]));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const backend: SignatureBackend = {
    async get(profileId) {
      await tick();
      const s = store.get(profileId);
      return s ? structuredClone(s) : null;
    },
    async save(input) {
      await tick();
      const first = Object.values(checkSignature(input))[0];
      if (first) throw new Error(first);
      const saved: EmailSignature = { ...normalizeSignature(input), updatedAt: new Date().toISOString() };
      store.set(saved.profileId, saved);
      return structuredClone(saved);
    },
  };
  return { backend, store };
}

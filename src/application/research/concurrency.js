export const STAGE_CONCURRENCY = Object.freeze({search: 10, sourceReview: 10, evidenceExtraction: 10, factAudit: 8, technicalWriting: 6, modelRequests: 10});

// Preserve input order. Drain active work before propagating failure so checkpoints
// cannot race a terminal task status; no new work starts after the first failure.
export async function mapConcurrent(items, limit, work) {
  const results = new Array(items.length);
  let cursor = 0, failure;
  async function worker() {
    while (!failure && cursor < items.length) {
      const index = cursor++;
      try { results[index] = await work(items[index], index); }
      catch (error) { failure ||= error; }
    }
  }
  await Promise.all(Array.from({length: Math.min(items.length, Math.max(1, limit))}, worker));
  if (failure) throw failure;
  return results;
}

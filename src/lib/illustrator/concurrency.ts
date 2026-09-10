// =========================================================================
// 并发受限的任务执行器
//
// 背景（v0.7.8）：插图管线此前把「按 6 个片段分片」的批次**串行** await，
// 一段 60 句的口播会产生 13 轮串行 LLM 请求（语义 10 轮 + 导演 3 轮），
// 一般耗时 105~155 秒，最坏（撞 90s 超时）可达 19 分钟。
//
// 不能直接用 Promise.all：商汤 Token Plan 限制约 1 QPS，
// 裸并发会连环触发 429 反而更慢。因此这里提供带并发上限的执行器。
// =========================================================================

/**
 * 以受限并发执行任务，返回与输入同序的结果数组。
 *
 * - 并发上限由 `limit` 控制（建议 2~3，兼顾 1 QPS 限制与吞吐）
 * - 任一任务抛错时，等待其余任务收尾后抛出第一个错误
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  if (items.length === 0) return results;

  const concurrency = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let cursor = 0;

  const runWorker = async (): Promise<void> => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  };

  const settled = await Promise.allSettled(
    Array.from({ length: concurrency }, () => runWorker())
  );

  const failed = settled.find((s) => s.status === 'rejected') as PromiseRejectedResult | undefined;
  if (failed) throw failed.reason;

  return results;
}

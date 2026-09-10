import { mapWithConcurrency } from './concurrency';

/**
 * v0.7.14：按模型 TPM 额度自适应的请求并发控制。
 *
 * 背景：v0.7.8 为了提速把规划阶段的并发开到 3、批量开到 10，结果 3 个大请求
 * 同时发出瞬间打满每分钟 Token 额度，连续 429 后整阶段失败，用户看到的是
 * 「切换什么模型都提示大模型未参与」。v0.7.10 一刀切改成串行 + 批量 5 止血。
 *
 * 但串行对高额度模型（如 DeepSeek 官方 500 万 TPM）是巨大浪费。正确做法是
 * 按模型实际额度决定并发：额度大的可以并发，额度小的串行；并且运行期一旦
 * 真的撞上限流，立即降级（减半），而不是继续硬撞。
 */

/**
 * 各供应商/模型的每分钟 Token 额度参考（TPM）。
 *
 * ⚠️ 这些数值是**保守估算**，不可能对所有账号档位都准确（同一模型免费版与
 * 企业版的 TPM 可能相差百倍）。因此它的作用不是精确计算，而是把模型分成
 * 「可以并发」和「必须串行」两档；真正撞上限流时由 AdaptiveConcurrency
 * 在运行期降级纠正。取不到时一律按串行处理（最安全）。
 */
const TPM_BY_MODEL: Record<string, number> = {
  // DeepSeek 官方：额度充足，是目前唯一值得开并发的常见选择
  'deepseek-chat': 5_000_000,
  'deepseek-reasoner': 5_000_000,
  // 小米 MiMo：Token Plan 是包月套餐，额度充足且不计单次费用；
  // 实测单批（6 句）耗时 60~106 秒，串行跑 12 批要十几分钟，必须开并发。
  'mimo-v2.5-pro': 3_000_000,
  'mimo-v2.5-flash': 3_000_000,
  // 通义千问 / 智谱：中等额度
  'qwen-max': 1_200_000,
  'qwen-plus': 1_200_000,
  'glm-4-plus': 1_000_000,
  // 豆包 / OpenAI：中低额度
  'doubao-pro-32k': 800_000,
  'doubao-lite-32k': 800_000,
  'gpt-4o': 800_000,
  'gpt-4o-mini': 800_000,
  // 以下均为**必须串行**档：额度低，或历史上实测容易撞限流
  'qwen-turbo': 300_000,
  'glm-4-air': 300_000,
  'glm-4-flash': 300_000,
  'claude-3-5-sonnet': 400_000,
  'moonshot-v1-8k': 200_000,
  'moonshot-v1-32k': 200_000,
  'moonshot-v1-128k': 200_000,
  // 商汤日日新：v0.7.8 实测并发会立刻触发 429，固定串行
  'sensenova-u1-fast': 100_000,
  'sensenova-u1.5-lite': 100_000,
  'abab6.5s-chat': 100_000,
};

/** 未知模型的默认额度：按最低档处理，即串行 */
const DEFAULT_TPM = 100_000;

/**
 * 并发分档阈值。
 * 用显式分档而不是公式：公式 (TPM × 比例 ÷ 单请求token) 在真实 TPM 数量级下
 * 几乎恒等于上限，等于没做区分（实测所有模型都算出 3）。
 */
const TIER_HIGH_TPM = 2_000_000; // ≥ 此额度 → 3 并发
const TIER_MID_TPM = 500_000; //  ≥ 此额度 → 2 并发
const MAX_CONCURRENCY = 3;

/** 兜底估算：按模型名前缀匹配 */
function lookupTpm(model: string): number {
  const m = (model || '').toLowerCase().trim();
  if (!m) return DEFAULT_TPM;
  if (TPM_BY_MODEL[m] !== undefined) return TPM_BY_MODEL[m];
  for (const key of Object.keys(TPM_BY_MODEL)) {
    if (m.startsWith(key) || key.startsWith(m)) return TPM_BY_MODEL[key];
  }
  // 未登记的模型：只有名字明确指向高额度系列时才给并发，其余一律串行
  if (m.includes('deepseek')) return 5_000_000;
  if (m.includes('qwen-max') || m.includes('qwen-plus')) return 1_200_000;
  return DEFAULT_TPM;
}

export interface ConcurrencyPlan {
  /** 建议的并发上限（至少 1） */
  limit: number;
  /** 该模型估算的 TPM，供 UI 显示 */
  tpm: number;
  /** 决策说明，用于诊断展示 */
  reason: string;
}

/**
 * 根据模型 TPM 额度分档计算安全并发。
 *
 * 上限硬性封顶在 3：即使额度再高也不值得为速度牺牲稳定性
 *（服务商往往还有并发连接数、RPM 等未公开限制）。
 * 未知模型一律串行。
 */
export function resolveConcurrency(model: string): ConcurrencyPlan {
  const tpm = lookupTpm(model);
  const limit = tpm >= TIER_HIGH_TPM ? MAX_CONCURRENCY : tpm >= TIER_MID_TPM ? 2 : 1;
  const tpmLabel = `${Math.round(tpm / 1000)}K`;
  const reason =
    limit <= 1
      ? `估算 TPM ${tpmLabel}，额度较低，采用串行以确保稳定`
      : `估算 TPM ${tpmLabel}，安全并发 ${limit}`;
  return { limit, tpm, reason };
}

/**
 * 运行期自适应并发控制器。
 *
 * 启动时采用 TPM 推算出的并发；一旦真的撞上限流（429 / TPM 超限），
 * 立即把并发减半（最低 1 = 串行），并把降低后的上限作为本次运行的硬上限
 * ——不做自动回升，因为回升会再次触发限流，白白浪费时间。
 */
export class AdaptiveConcurrency {
  private limit: number;
  private readonly initialLimit: number;
  private rateLimitHits = 0;
  private completed = 0;
  private failed = 0;

  constructor(public readonly plan: ConcurrencyPlan) {
    this.limit = plan.limit;
    this.initialLimit = plan.limit;
  }

  get currentLimit(): number {
    return this.limit;
  }

  /** 是否已从并发降级为串行 */
  get degradedToSerial(): boolean {
    return this.initialLimit > 1 && this.limit === 1;
  }

  get stats() {
    return {
      initialLimit: this.initialLimit,
      finalLimit: this.limit,
      rateLimitHits: this.rateLimitHits,
      completed: this.completed,
      failed: this.failed,
    };
  }

  /** 命中限流：并发减半，最低 1 */
  onRateLimit(): void {
    this.rateLimitHits++;
    this.limit = Math.max(1, Math.floor(this.limit / 2));
  }

  onSuccess(): void {
    this.completed++;
  }

  onFailure(): void {
    this.failed++;
  }

  /** 判断一个错误是否为限流 / TPM 超限 */
  static isRateLimitError(err: unknown): boolean {
    const msg = String((err as any)?.message || err || '');
    return /429|too many requests|rate.?limit|tpm|tokens?\s*per\s*minute|exceeds.*limit|quota/i.test(msg);
  }

  /**
   * 以自适应并发跑完所有任务。
   *
   * 注意：并发度是**动态**的——每批开始前重新读取当前 limit，
   * 因此中途一旦限流降级，后续批次会立即按新并发执行。
   * 成功/失败计数由本方法统一维护，调用方只需在识别到限流时调 onRateLimit()。
   */
  async run<T, R>(items: T[], worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
    if (items.length === 0) return [];

    const guarded = async (item: T, index: number): Promise<R> => {
      try {
        const r = await worker(item, index);
        this.completed++;
        return r;
      } catch (err) {
        this.failed++;
        if (AdaptiveConcurrency.isRateLimitError(err)) this.onRateLimit();
        throw err;
      }
    };

    // 串行：直接顺序执行，避免调度器开销
    if (this.limit <= 1) {
      const out: R[] = [];
      for (let i = 0; i < items.length; i++) {
        out.push(await guarded(items[i], i));
      }
      return out;
    }

    // 并发：按当前 limit 分批，每批开始前重新读取 limit（支持中途降级）
    const results: R[] = new Array(items.length);
    let cursor = 0;
    while (cursor < items.length) {
      const width = Math.max(1, this.limit);
      const slice = items.slice(cursor, cursor + width);
      const base = cursor;
      const part = await mapWithConcurrency(slice, width, (item, i) => guarded(item, base + i));
      for (let i = 0; i < part.length; i++) results[base + i] = part[i];
      cursor += width;
    }
    return results;
  }
}

/** 便捷入口：按模型解析并发计划并创建控制器 */
export function createAdaptiveConcurrency(model: string): AdaptiveConcurrency {
  return new AdaptiveConcurrency(resolveConcurrency(model));
}

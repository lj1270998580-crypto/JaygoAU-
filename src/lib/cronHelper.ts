// 5 字段 Cron 表达式时间计算与匹配助手
// 格式: [分] [时] [日] [月] [周]
// 例如: "30 9 * * *" (每天 09:30)
//       "0 */2 * * *" (每隔 2 小时)
//       "*/30 * * * *" (每隔 30 分钟)

export interface NextCronRunResult {
  nextDate: Date | null;
  diffMs: number;
  friendlyCountdown: string;
  formattedTarget: string;
}

/**
 * 校验指定时刻是否命中 Cron 规则
 */
export function isCronMatch(cronStr: string, date: Date): boolean {
  if (!cronStr || !cronStr.trim()) return false;
  const parts = cronStr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minPart, hrPart, domPart, monPart, dowPart] = parts;
  const min = date.getMinutes();
  const hr = date.getHours();
  const dom = date.getDate();
  const mon = date.getMonth() + 1;
  const dow = date.getDay(); // 0 是周日

  const matchField = (field: string, val: number): boolean => {
    if (field === '*') return true;
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2), 10);
      return !isNaN(step) && step > 0 && val % step === 0;
    }
    const nums = field.split(',').map((s) => parseInt(s.trim(), 10));
    return nums.includes(val);
  };

  return (
    matchField(minPart, min) &&
    matchField(hrPart, hr) &&
    matchField(domPart, dom) &&
    matchField(monPart, mon) &&
    matchField(dowPart, dow)
  );
}

/**
 * 计算给定 Cron 表达式的下一次执行时刻及剩余倒计时
 * 算法：从当前时刻后 1 分钟开始，逐分钟向前搜索命中点（上限 366 天，快速搜索）
 */
export function calculateNextCronRun(
  cronStr: string,
  fromDate: Date = new Date()
): NextCronRunResult {
  if (!cronStr || !cronStr.trim()) {
    return {
      nextDate: null,
      diffMs: 0,
      friendlyCountdown: '未设置定时',
      formattedTarget: '--',
    };
  }

  // 规范化起始时间：向下对齐整分钟后加 1 分钟
  const start = new Date(fromDate.getTime() + 60000);
  start.setSeconds(0, 0);

  const cur = new Date(start.getTime());
  // 最长搜索 366 天的分钟数：527,040 分钟
  const maxMinutes = 527040;
  let found = false;

  for (let i = 0; i < maxMinutes; i++) {
    if (isCronMatch(cronStr, cur)) {
      found = true;
      break;
    }
    cur.setMinutes(cur.getMinutes() + 1);
  }

  if (!found) {
    return {
      nextDate: null,
      diffMs: 0,
      friendlyCountdown: '未匹配到下一次执行时刻',
      formattedTarget: '--',
    };
  }

  const diffMs = cur.getTime() - fromDate.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;

  let friendlyCountdown = '';
  if (diffMinutes <= 1) {
    friendlyCountdown = '即将执行 (< 1分钟)';
  } else if (days > 0) {
    friendlyCountdown = `${days} 天 ${remHours} 小时 ${minutes} 分钟后`;
  } else if (hours > 0) {
    friendlyCountdown = `${hours} 小时 ${minutes} 分钟后`;
  } else {
    friendlyCountdown = `${minutes} 分钟后`;
  }

  const year = cur.getFullYear();
  const month = String(cur.getMonth() + 1).padStart(2, '0');
  const day = String(cur.getDate()).padStart(2, '0');
  const hh = String(cur.getHours()).padStart(2, '0');
  const mm = String(cur.getMinutes()).padStart(2, '0');
  const formattedTarget = `${year}-${month}-${day} ${hh}:${mm}`;

  return {
    nextDate: cur,
    diffMs,
    friendlyCountdown,
    formattedTarget,
  };
}

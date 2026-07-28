import fs from "node:fs";
import path from "node:path";

const STATE_FILE = "proactive-state.json";

function readState(dataDir) {
  const fp = path.join(dataDir, STATE_FILE);
  try { if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, "utf-8")); } catch {}
  return {};
}

function writeState(dataDir, state) {
  const fp = path.join(dataDir, STATE_FILE);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(state, null, 2));
}

function isQuietHours(config) {
  const enabled = config?.get?.("quietHoursEnabled");
  if (!enabled) return false;
  const start = config?.get?.("quietHoursStart");
  const end = config?.get?.("quietHoursEnd");
  if (typeof start !== "number" || typeof end !== "number") return false;
  const hour = new Date().getHours();
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

export const name = "proactive_inject";
export const description =
  "主动检查并在条件满足时直接触发 session:inject。供 Automation 定时调用。" +
  "如果条件满足（超过阈值、冷却期已过、未静默），就注入 __proactive__ 消息并触发 AI turn。";

export const parameters = {
  type: "object",
  properties: {},
};

export async function execute(input, ctx) {
  const dataDir = ctx.dataDir;
  const state = readState(dataDir);
  const now = Date.now();

  if (!state.sessionPath) return "[proactive] 未配置会话路径";
  if (state.sessionEnded || state.silentMode) return "[proactive] 会话已结束或已静默";

  if (isQuietHours(ctx.config)) return "[proactive] 夜间免打扰时段";

  // 连续未回复检测
  if (state.missPendingCheck) {
    state.consecutiveMisses = state.lastActivityTime > state.lastProactiveTime ? 0 : (state.consecutiveMisses || 0) + 1;
    state.missPendingCheck = false;
  }

  const maxMisses = ctx.config?.get?.("maxMisses") ?? 3;
  if (state.consecutiveMisses >= maxMisses) {
    state.silentMode = true;
    writeState(dataDir, state);
    return "[proactive] 连续未回复超过上限，已静默";
  }

  // 冷却期
  const cooldownMs = (ctx.config?.get?.("cooldownMinutes") ?? 15) * 60 * 1000;
  const effectiveCooldown = cooldownMs * Math.pow(2, state.consecutiveMisses || 0);
  if (now - (state.lastProactiveTime || 0) < effectiveCooldown) return "[proactive] 冷却中";

  // 阈值
  const level = ctx.config?.get?.("presenceLevel") || state.presenceLevel || "medium";
  const thresholds = { low: 120 * 60 * 1000, medium: 30 * 60 * 1000, high: 10 * 60 * 1000 };
  const threshold = thresholds[level] || thresholds.medium;
  const sinceActivity = now - (state.lastActivityTime || now);
  if (sinceActivity < threshold) return `[proactive] 活跃中 (${Math.round(sinceActivity / 60000)}m < ${Math.round(threshold / 60000)}m)`;

  // 触发
  try {
    const text = `__proactive__ 用户已安静 ${Math.round(sinceActivity / 60000)} 分钟，当前存在感级别: ${level}`;
    await ctx.bus.request("session:inject", {
      text,
      sessionPath: state.sessionPath,
      mode: "trigger",
    });
    state.lastProactiveTime = now;
    state.missPendingCheck = true;
    writeState(dataDir, state);
    return `[proactive] 已触发注入 (${Math.round(sinceActivity / 60000)}m 不活跃)`;
  } catch (err) {
    ctx.log?.error?.("proactive inject failed", { error: err.message });
    return `[proactive] 注入失败: ${err.message}`;
  }
}

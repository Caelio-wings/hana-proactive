import fs from "node:fs";
import path from "node:path";

const STATE_FILE = "proactive-state.json";

const DEFAULTS = {
  inactivityThresholdMs: {
    low: 120 * 60 * 1000,
    medium: 30 * 60 * 1000,
    high: 10 * 60 * 1000,
  },
  cooldownMs: 15 * 60 * 1000,
};

function readState(dataDir) {
  const fp = path.join(dataDir, STATE_FILE);
  try {
    if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {}
  return {};
}

export const name = "proactive_check";
export const description = "检查是否到了该主动说话的时候。Agent 每次准备回复前调用，如果返回 signal=true 就自然开口。";

export const parameters = {
  type: "object",
  properties: {},
};

export async function execute(input, ctx) {
  const dataDir = ctx.dataDir;
  const now = Date.now();
  const state = readState(dataDir);

  if (!state.sessionPath) {
    return JSON.stringify({
      signal: false,
      reason: "no_session",
      message: "会话未配置，请先调用 proactive_setup。",
    });
  }

  const sinceActivity = now - (state.lastActivityTime || now);
  const sinceProactive = now - (state.lastProactiveTime || 0);
  const level = state.presenceLevel || "medium";
  const thresholds = state.inactivityThresholdMs || DEFAULTS.inactivityThresholdMs;
  const threshold = thresholds[level] || thresholds.medium;
  const cooldown = state.cooldownMs || DEFAULTS.cooldownMs;

  const minutesSinceActivity = Math.round(sinceActivity / 60000);
  const minutesThreshold = Math.round(threshold / 60000);

  ctx.log?.info?.("proactive check", {
    sinceActivityMin: minutesSinceActivity,
    sinceProactiveMin: Math.round(sinceProactive / 60000),
    thresholdMin: minutesThreshold,
    level,
  });

  // 冷却期内不触发
  if (sinceProactive < cooldown) {
    return JSON.stringify({
      signal: false,
      reason: "cooldown",
      message: `距上次主动仅 ${Math.round(sinceProactive / 60000)} 分钟，冷却期 ${Math.round(cooldown / 60000)} 分钟` ,
    });
  }

  // 用户仍活跃
  if (sinceActivity < threshold) {
    return JSON.stringify({
      signal: false,
      reason: "active",
      message: `用户 ${minutesSinceActivity} 分钟前还有活动，阈值 ${minutesThreshold} 分钟`,
    });
  }

  // 条件满足！
  return JSON.stringify({
    signal: true,
    reason: "ready",
    level,
    sinceActivityMin: minutesSinceActivity,
    message: `用户已安静 ${minutesSinceActivity} 分钟 (阈值 ${minutesThreshold} 分钟)，存在感级别 ${level}，可以主动开口了`,
  });
}

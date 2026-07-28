import fs from "node:fs";
import path from "node:path";

// ─── 硬默认值（当 config 和 state 都没设时使用） ──────
const HARD_DEFAULTS = {
  cooldownMs: 15 * 60 * 1000,
  maxMisses: 3,
  inactivityThresholdMs: {
    low: 120 * 60 * 1000,
    medium: 30 * 60 * 1000,
    high: 10 * 60 * 1000,
  },
};

// ─── 状态文件操作 ──────────────────────────────────────
function fp(dataDir) {
  return path.join(dataDir, "proactive-state.json");
}

function loadState(dataDir) {
  try {
    if (fs.existsSync(fp(dataDir)))
      return JSON.parse(fs.readFileSync(fp(dataDir), "utf-8"));
  } catch {}
  return {};
}

function saveState(dataDir, state) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(fp(dataDir), JSON.stringify(state, null, 2));
}

// ─── 读配置 ────────────────────────────────────────────
function readPresenceLevel(ctx, state) {
  return ctx.config?.get?.("presenceLevel") || state.presenceLevel || "medium";
}

function readCooldownMs(ctx) {
  const min = ctx.config?.get?.("cooldownMinutes");
  if (typeof min === "number" && min > 0) return min * 60 * 1000;
  return HARD_DEFAULTS.cooldownMs;
}

function readMaxMisses(ctx) {
  const n = ctx.config?.get?.("maxMisses");
  if (typeof n === "number" && n > 0) return n;
  return HARD_DEFAULTS.maxMisses;
}

function readThreshold(ctx, state) {
  const level = readPresenceLevel(ctx, state);
  return HARD_DEFAULTS.inactivityThresholdMs[level] || HARD_DEFAULTS.inactivityThresholdMs.medium;
}

// ─── 夜间免打扰检测 ────────────────────────────────────
function isQuietHours(ctx) {
  const enabled = ctx.config?.get?.("quietHoursEnabled");
  if (!enabled) return false;

  const start = ctx.config?.get?.("quietHoursStart");
  const end = ctx.config?.get?.("quietHoursEnd");
  if (typeof start !== "number" || typeof end !== "number") return false;

  const now = new Date();
  const hour = now.getHours();

  // 跨午夜：23→7 → hour >= 23 或 hour < 7
  // 同一天：13→14 → hour >= 13 且 hour < 14
  if (start <= end) {
    return hour >= start && hour < end;
  } else {
    return hour >= start || hour < end;
  }
}

// ─── 每次心跳 ───────────────────────────────────────────
async function tick(ctx) {
  const dataDir = ctx.dataDir;
  const now = Date.now();
  const state = loadState(dataDir);

  if (!state.sessionPath) return;
  if (state.sessionEnded || state.silentMode) return;

  // 夜间免打扰
  if (isQuietHours(ctx)) return;

  // ── 连续未回复检测 ──
  if (state.missPendingCheck) {
    if (state.lastActivityTime > state.lastProactiveTime) {
      state.consecutiveMisses = 0;
    } else {
      state.consecutiveMisses = (state.consecutiveMisses || 0) + 1;
    }
    state.missPendingCheck = false;
    saveState(dataDir, state);
  }

  const maxMisses = readMaxMisses(ctx);
  if (state.consecutiveMisses >= maxMisses) {
    state.silentMode = true;
    saveState(dataDir, state);
    return;
  }

  // ── 冷却期（带指数递增） ──
  const sinceProactive = now - (state.lastProactiveTime || 0);
  const baseCooldown = readCooldownMs(ctx);
  const effectiveCooldown = baseCooldown * Math.pow(2, state.consecutiveMisses || 0);
  if (sinceProactive < effectiveCooldown) return;

  // ── 活跃度阈值 ──
  const sinceActivity = now - (state.lastActivityTime || now);
  const threshold = readThreshold(ctx, state);
  if (sinceActivity < threshold) return;

  // ── 发送主动消息 ──
  try {
    const level = readPresenceLevel(ctx, state);
    const text = `__proactive__ 用户已安静 ${Math.round(sinceActivity / 60000)} 分钟，当前存在感级别: ${level}`;

    await ctx.bus.request("session:inject", {
      text,
      sessionPath: state.sessionPath,
      mode: "trigger",
    });

    state.lastProactiveTime = now;
    state.missPendingCheck = true;
    saveState(dataDir, state);
  } catch (err) {
    ctx.log?.error?.("proactive send failed", { error: err.message });
  }
}

// ─── 生命周期 ───────────────────────────────────────────
export default class Plugin {
  async onload() {
    const ctx = this.ctx;
    const dataDir = ctx.dataDir;
    const state = loadState(dataDir);
    const level = readPresenceLevel(ctx, state);

    ctx.log?.info?.("hana-proactive loaded", {
      hasSessionPath: !!state.sessionPath,
      presenceLevel: level,
      quietHours: isQuietHours(ctx),
      silentMode: !!state.silentMode,
    });

    this._timer = setInterval(() => tick(ctx), 5 * 60 * 1000);
  }

  async onunload() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

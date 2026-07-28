import fs from "node:fs";
import path from "node:path";

const STATE_FILE = "proactive-state.json";

function readState(dataDir) {
  const fp = path.join(dataDir, STATE_FILE);
  try {
    if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {}
  return {};
}

function writeState(dataDir, state) {
  const fp = path.join(dataDir, STATE_FILE);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(state, null, 2));
}

function isPresenceLevel(v) {
  return v === "low" || v === "medium" || v === "high";
}

export const name = "proactive_setup";
export const description = "配置主动对话插件：设置存在感级别。自动从当前会话获取会话路径。在会话开始时调用一次。";

export const parameters = {
  type: "object",
  properties: {
    presenceLevel: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "可选，存在感级别。low=少打扰（2h不活跃触发），medium（30min），high（10min）",
    },
  },
};

export async function execute(input, ctx) {
  const { presenceLevel } = input;
  const dataDir = ctx.dataDir;
  const sessionPath = ctx.sessionPath;

  if (!sessionPath) {
    return `[proactive] 错误：无法获取当前会话路径。请在对话中直接调用此工具。`;
  }

  const existing = readState(dataDir);
  const updates = { sessionPath };

  // 新会话：重置结束/静默标记，避免全局影响
  if (existing.sessionPath && existing.sessionPath !== sessionPath) {
    updates.sessionEnded = false;
    updates.silentMode = false;
    updates.consecutiveMisses = 0;
    updates.missPendingCheck = false;
  }

  if (presenceLevel && isPresenceLevel(presenceLevel)) {
    updates.presenceLevel = presenceLevel;
    try { ctx.config?.set?.("presenceLevel", presenceLevel); } catch {}
  }

  const newState = { ...existing, ...updates };
  writeState(dataDir, newState);

  const level = (newState.presenceLevel || "medium");

  ctx.log?.info?.("proactive setup", { sessionPath, presenceLevel: level });

  return `[proactive] 已配置。当前存在感级别: ${level}。我会在检测到你不活跃时适当时机开口。要调整级别随时告诉我。`;
}

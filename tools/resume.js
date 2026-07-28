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

export const name = "proactive_resume";
export const description = "恢复主动对话。清除静默模式或对话结束标记，重新开始主动触发。";
export const parameters = {
  type: "object",
  properties: {},
};

export async function execute(input, ctx) {
  const dataDir = ctx.dataDir;
  const state = readState(dataDir);
  state.silentMode = false;
  state.sessionEnded = false;
  state.consecutiveMisses = 0;
  state.missPendingCheck = false;
  writeState(dataDir, state);
  ctx.log?.info?.("proactive resumed");
  return `[proactive] 已恢复。将重新开始主动检测。`;
}

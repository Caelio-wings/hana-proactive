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

export const name = "proactive_mark_ended";
export const description = "标记当前对话已结束。当用户表达结束意图（晚安、先这样、下次聊等）时调用，插件将停止主动触发。";
export const parameters = {
  type: "object",
  properties: {},
};

export async function execute(input, ctx) {
  const dataDir = ctx.dataDir;
  const state = readState(dataDir);
  state.sessionEnded = true;
  writeState(dataDir, state);
  ctx.log?.info?.("proactive session marked ended");
  return `[proactive] 已标记对话结束，不再主动打扰。`;
}

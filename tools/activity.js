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
  const dir = path.dirname(fp);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(state, null, 2));
}

export const name = "proactive_record_activity";
export const description = "记录用户活跃时间。每次用户发消息后调用此工具，更新最后活跃时间戳。";

export const parameters = {
  type: "object",
  properties: {},
};

export async function execute(input, ctx) {
  const dataDir = ctx.dataDir;
  const now = Date.now();

  const existing = readState(dataDir);
  existing.lastActivityTime = now;
  writeState(dataDir, existing);

  ctx.log?.info?.("proactive activity recorded", { lastActivityTime: now });

  return `[proactive] 活跃时间已更新。`;
}

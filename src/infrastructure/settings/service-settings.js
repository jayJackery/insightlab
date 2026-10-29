import { readFile, writeFile, rename } from "../../browser/shims/fs.js?v=e9968bcba1cb9548";

const secretFields = ["DEEPSEEK_API_KEY", "OPENAI_API_KEY", "TAVILY_API_KEY"];
const fields = [...secretFields, "MODEL_PROVIDER", "OPENAI_BASE_URL", "OPENAI_MODEL", "SEARCH_PROVIDER"];

export function modelConfiguration(env) {
  const provider = env.MODEL_PROVIDER || (!env.OPENAI_API_KEY && env.DEEPSEEK_API_KEY ? "deepseek" : "compatible");
  return { provider, key: provider === "deepseek" ? env.DEEPSEEK_API_KEY : env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL || (provider === "deepseek" ? "https://api.deepseek.com" : "https://api.openai.com/v1"),
    model: env.OPENAI_MODEL || (provider === "deepseek" ? "deepseek-flash" : "gpt-4o-mini") };
}
export async function createServiceSettings(path, environment = {}) {
  let saved = {};
  if (path) try {
    const value = JSON.parse(await readFile(path, "utf8"));
    for (const name of fields) if (typeof value[name] === "string") saved[name] = value[name];
  } catch (error) { if (error.code !== "ENOENT") throw new Error("本机服务配置无法读取，请检查 data/service-settings.json 的格式与权限。"); }
  const env = () => ({ ...environment, ...saved });
  const redact = (value) => {
    let result = String(value || "");
    for (const key of secretFields.flatMap((name) => [environment[name], saved[name]]).filter(Boolean)) result = result.split(key).join("[密钥已隐藏]");
    return result;
  };
  const publicConfig = () => {
    const current = env(), model = modelConfiguration(current);
    const provider = current.SEARCH_PROVIDER || (current.DEEPSEEK_API_KEY ? "deepseek" : "tavily");
    return { modelReady: Boolean(model.key), searchReady: Boolean(provider === "deepseek" ? current.DEEPSEEK_API_KEY : current.TAVILY_API_KEY),
      modelProvider: model.provider, modelBaseUrl: model.baseUrl, model: model.model, searchProvider: provider,
      keys: Object.fromEntries(secretFields.map((name) => [name, { configured: Boolean(current[name]), source: Object.hasOwn(saved, name) ? "local" : current[name] ? "environment" : "none" }])) };
  };
  const save = async (payload) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Error("配置格式无效");
    const next = { ...saved };
    for (const name of Object.keys(payload)) {
      if (!fields.includes(name) && name !== "clearKeys") throw Error("包含不支持的配置项");
      if (name === "clearKeys") continue;
      if (typeof payload[name] !== "string" || payload[name].length > 4096 || /[\r\n\0]/.test(payload[name])) throw Error("配置值格式无效");
      const value = payload[name].trim();
      // Empty password fields preserve existing credentials; removal is explicit.
      if (!secretFields.includes(name) || value) next[name] = value;
    }
    if (payload.clearKeys !== undefined) {
      if (!Array.isArray(payload.clearKeys) || payload.clearKeys.some((name) => !secretFields.includes(name))) throw Error("移除密钥的配置项无效");
      for (const name of payload.clearKeys) next[name] = "";
    }
    const merged = { ...environment, ...next };
    if (merged.MODEL_PROVIDER && !["deepseek", "compatible"].includes(merged.MODEL_PROVIDER)) throw Error("请选择有效的模型服务");
    if (merged.SEARCH_PROVIDER && !["deepseek", "tavily"].includes(merged.SEARCH_PROVIDER)) throw Error("请选择有效的搜索服务");
    if (merged.OPENAI_BASE_URL) {
      let url; try { url = new URL(merged.OPENAI_BASE_URL); } catch { throw Error("模型接口地址不是有效的网址"); }
      const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
      if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) throw Error("接口须使用 HTTPS（本机接口可用 HTTP），且不能含账号、查询参数或片段");
      next.OPENAI_BASE_URL = url.href.replace(/\/$/, "");
    }
    if (path) { await writeFile(path + ".tmp", JSON.stringify(next, null, 2), { mode: 0o600 }); await rename(path + ".tmp", path); }
    saved = next;
    return publicConfig();
  };
  return { env, publicConfig, save, redact };
}

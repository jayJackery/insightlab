export class ModelOutputError extends Error {
  constructor(code, message, diagnostic) { super(message); this.code = code; this.diagnostic = diagnostic; }
}
export function parseModelResponse(result) {
  const choice = result?.choices?.[0], message = choice?.message;
  const content = typeof message?.content === "string" ? message.content : Array.isArray(message?.content) ? message.content.filter((v) => v.type === "text").map((v) => v.text || "").join("") : "";
  const diagnostic = { finishReason: choice?.finish_reason || "not_provided", responseCharacters: content.length, completionTokens: result?.usage?.completion_tokens || null };
  if (choice?.finish_reason === "length") throw new ModelOutputError("MODEL_TRUNCATED", "模型输出达到长度上限而被截断，未发布不完整内容。", diagnostic);
  if (message?.refusal || choice?.finish_reason === "content_filter") throw new ModelOutputError("MODEL_REFUSED", "模型服务未提供本阶段内容。", diagnostic);
  if (!content.trim()) throw new ModelOutputError("MODEL_EMPTY", "模型返回了空内容。", diagnostic);
  const text = content.trim().replace(/^\uFEFF/u, "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    // Accept a single complete object surrounded by prose. Never invent missing braces or facts.
    const start = text.indexOf("{"); let depth = 0, quoted = false, escaped = false, end = -1;
    for (let i = start; start >= 0 && i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; continue; }
      if (c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { end = i + 1; break; }
    }
    if (end > start && !/[{}]/.test(text.slice(end))) try { parsed = JSON.parse(text.slice(start, end)); } catch {}
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ModelOutputError("MODEL_JSON_INVALID", "模型返回的结构不完整或不符合JSON对象格式。", diagnostic);
  return { value: parsed, diagnostic };
}

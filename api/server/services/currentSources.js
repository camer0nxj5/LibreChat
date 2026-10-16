const REMINDER = '[Current sources reminder] This question may depend on recent changes. Use an available web search tool to verify current information before answering; extract relevant sources when needed and cite them. If search is unavailable or fails, state that limitation. Do not claim to have searched without tool results.';
function needsCurrentSources(value) {
  if (typeof value !== 'string') return false;
  if (/\b(?:do not|don't|without|no)\s+(?:web\s+)?(?:search|brows(?:e|ing))\b/i.test(value)) return false;
  const cleaned=value.replace(/\b(?:current|latest)\s+(?:file|conversation|chat|prompt|message|selection|directory|folder|branch|code|function|class|variable|line|cell|sheet|request|task|project)\b/gi,'');
  return /\b(?:current|currently|latest|recent|recently|today|tonight|this\s+(?:week|month|year)|up[- ]to[- ]date|as of now|right now)\b/i.test(cleaned);
}
module.exports={REMINDER,needsCurrentSources};

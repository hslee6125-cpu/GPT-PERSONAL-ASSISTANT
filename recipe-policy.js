function isOutputLimitReason(reason) {
  return ["max_output_tokens", "max_tokens"].includes(String(reason || ""));
}

async function runRecipeParseWithRetry(executor) {
  try {
    return await executor({ maxOutputTokens: 20000, reasoningEffort: 'minimal' });
  } catch (error) {
    if (error?.code !== 'MAX_OUTPUT_TOKENS') throw error;
    return executor({ maxOutputTokens: 64000, reasoningEffort: 'minimal' });
  }
}

module.exports = { runRecipeParseWithRetry, isOutputLimitReason };

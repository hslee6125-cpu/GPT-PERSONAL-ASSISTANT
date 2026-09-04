function assistantRequestPolicy() {
  return { maxOutputTokens: 800, reasoningEffort: 'minimal' };
}

async function runAssistantAnalyzeWithRetry(executor) {
  try {
    return await executor(assistantRequestPolicy());
  } catch (error) {
    if (error?.code !== 'MAX_OUTPUT_TOKENS') throw error;
    return executor({ maxOutputTokens: 2000, reasoningEffort: 'minimal' });
  }
}

module.exports = { assistantRequestPolicy, runAssistantAnalyzeWithRetry };

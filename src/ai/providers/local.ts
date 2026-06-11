import axios from 'axios';

export interface LocalChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LocalModelResponse {
  text: string;
  evalCount?: number;
  promptEvalCount?: number;
  evalDurationMs?: number;
  totalDurationMs?: number;
}

export async function callLocalModel(
  endpoint: string,
  messages: LocalChatMessage[],
): Promise<LocalModelResponse> {
  try {
    const response = await axios.post(
      endpoint,
      {
        model: 'bob-local-dna:latest',
        messages: messages,
        stream: false,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 180000,
      }
    );

    // Ollama /api/chat response format
    if (response.data?.message?.content) {
      return {
        text: response.data.message.content,
        evalCount: response.data.eval_count || undefined,
        promptEvalCount: response.data.prompt_eval_count || undefined,
        evalDurationMs: response.data.eval_duration ? Math.round(response.data.eval_duration / 1000000) : undefined,
        totalDurationMs: response.data.total_duration ? Math.round(response.data.total_duration / 1000000) : undefined,
      };
    }

    // OpenAI-compatible format fallback
    const choice = response.data?.choices?.[0];
    if (choice?.message?.content) {
      return {
        text: choice.message.content,
        evalCount: response.data.usage?.completion_tokens || undefined,
        promptEvalCount: response.data.usage?.prompt_tokens || undefined,
      };
    }

    if (typeof response.data?.response === 'string') {
      return { text: response.data.response };
    }

    return { text: 'No response received from local model.' };
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to local model. Is Ollama running? Check your endpoint: ' + endpoint);
    }
    throw new Error('Local model error: ' + (error.response?.status ? `Status ${error.response.status}` : error.message));
  }
}
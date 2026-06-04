import axios from 'axios';

export interface LocalChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callLocalModel(
  endpoint: string,
  messages: LocalChatMessage[],
): Promise<string> {
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
      return response.data.message.content;
    }

    // OpenAI-compatible format fallback
    const choice = response.data?.choices?.[0];
    if (choice?.message?.content) {
      return choice.message.content;
    }

    if (typeof response.data?.response === 'string') {
      return response.data.response;
    }

    return 'No response received from local model.';
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to local model. Is Ollama running? Check your endpoint: ' + endpoint);
    }
    throw new Error('Local model error: ' + (error.response?.status ? `Status ${error.response.status}` : error.message));
  }
}
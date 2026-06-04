import axios from 'axios';
import { getConfig } from './config-store.js';

const FUNCTIONS_BASE = 'https://us-central1-seedlingapp.cloudfunctions.net';

export async function callCloudFunction(functionName: string, data: Record<string, any>): Promise<any> {
  const config = getConfig();

  if (!config.authToken) {
    throw new Error('Not authenticated. Run `bob login` first.');
  }

  const response = await axios.post(
    `${FUNCTIONS_BASE}/${functionName}`,
    { data },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.authToken}`,
      },
      timeout: 180000,
    }
  );

  return response.data?.result || response.data;
}
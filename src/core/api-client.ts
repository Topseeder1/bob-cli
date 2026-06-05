import axios from 'axios';
import { getConfig, setConfigValue } from './config-store.js';
import { refreshAuthToken } from '../commands/login.js';

const FUNCTIONS_BASE = 'https://us-central1-seedlingapp.cloudfunctions.net';

export async function callCloudFunction(functionName: string, data: Record<string, any>): Promise<any> {
  const config = getConfig();

  if (!config.authToken) {
    throw new Error('Not authenticated. Run `bob login` first.');
  }

  try {
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

  } catch (error: any) {
    // Auto-refresh on 401
    if (error.response?.status === 401 && config.refreshToken) {
      try {
        const newToken = await refreshAuthToken(config.refreshToken);

        // Retry the request with the new token
        const retryResponse = await axios.post(
          `${FUNCTIONS_BASE}/${functionName}`,
          { data },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${newToken}`,
            },
            timeout: 180000,
          }
        );

        return retryResponse.data?.result || retryResponse.data;

      } catch (refreshError: any) {
        setConfigValue('loggedIn', false);
        throw new Error('Session expired. Run `bob login` again.');
      }
    }

    throw error;
  }
}
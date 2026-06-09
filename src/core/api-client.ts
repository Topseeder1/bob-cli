import axios from 'axios';
import { getConfig, setConfigValue } from './config-store.js';
import { refreshAuthToken } from '../commands/login.js';

const FUNCTIONS_BASE = 'https://us-central1-seedlingapp.cloudfunctions.net';

/**
 * Calls a Firebase onCall Cloud Function.
 */
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
    const status = error.response?.status;

    if (status === 401 && config.refreshToken) {
      try {
        const newToken = await refreshAuthToken(config.refreshToken);

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

    if (status === 404) {
      throw new Error(`Function "${functionName}" not found. Is it deployed?`);
    }

    if (status === 403) {
      throw new Error('Permission denied. You may not have access to this feature.');
    }

    if (status === 500) {
      const serverMsg = error.response?.data?.error?.message || error.response?.data?.error || 'Internal server error';
      throw new Error(`Server error: ${serverMsg}`);
    }

    if (status === 429) {
      throw new Error('Rate limited. Please wait a moment and try again.');
    }

    const errorMsg = error.response?.data?.error?.message || error.message || `Request failed with status ${status}`;
    throw new Error(errorMsg);
  }
}

/**
 * Calls a Firebase onRequest Cloud Function (raw HTTP endpoint).
 * Used for functions like getPersonalizedResponse that use onRequest instead of onCall.
 */
export async function callHTTPFunction(functionName: string, data: Record<string, any>): Promise<any> {
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
        timeout: 300000,
      }
    );

    return response.data?.data || response.data;

  } catch (error: any) {
    const status = error.response?.status;

    if (status === 401 && config.refreshToken) {
      try {
        const newToken = await refreshAuthToken(config.refreshToken);

        const retryResponse = await axios.post(
          `${FUNCTIONS_BASE}/${functionName}`,
          { data },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${newToken}`,
            },
            timeout: 300000,
          }
        );

        return retryResponse.data?.data || retryResponse.data;

      } catch (refreshError: any) {
        setConfigValue('loggedIn', false);
        throw new Error('Session expired. Run `bob login` again.');
      }
    }

    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      throw new Error('Connection was reset. The function may still be running — check the web app for the response.');
    }

    if (status === 404) {
      throw new Error(`Function "${functionName}" not found. Is it deployed?`);
    }

    if (status === 403) {
      throw new Error('Permission denied. You may not have access to this feature.');
    }

    if (status === 500) {
      const serverMsg = error.response?.data?.error?.message || error.response?.data?.error || 'Internal server error';
      throw new Error(`Server error: ${serverMsg}`);
    }

    if (status === 429) {
      throw new Error('Rate limited. Please wait a moment and try again.');
    }

    const errorMsg = error.response?.data?.error?.message || error.message || `Request failed with status ${status}`;
    throw new Error(errorMsg);
  }
}

export function isAuthenticated(): boolean {
  const config = getConfig();
  return !!(config.loggedIn && config.authToken);
}
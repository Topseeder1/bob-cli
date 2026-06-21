// File: src/core/api-client.ts

import axios from 'axios';
import { getConfig, setConfigValue } from './config-store.js';
import { refreshAuthToken } from '../commands/login.js';

// ─── Cloud Functions base URL injected at build time via tsup ─────
// Never hardcoded. Set in .env — never committed to git.
const FUNCTIONS_BASE = process.env.FUNCTIONS_BASE
  || 'https://us-central1-seedlingapp.cloudfunctions.net';

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
    const serverMsg = error.response?.data?.error?.message
      || error.response?.data?.error
      || error.message
      || `Request failed with status ${status}`;

    if (status === 401 && config.refreshToken) {
      let newToken: string;
      try {
        newToken = await refreshAuthToken(config.refreshToken);
      } catch {
        setConfigValue('loggedIn', false);
        throw new Error('Session expired. Run `bob login` again.');
      }

      try {
        const retry = await axios.post(
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
        return retry.data?.result || retry.data;
      } catch (retryError: any) {
        const retryStatus = retryError.response?.status;
        const retryMsg = retryError.response?.data?.error?.message || retryError.message;
        if (retryStatus === 401) {
          setConfigValue('loggedIn', false);
          throw new Error('Session expired. Run `bob login` again.');
        }
        throw new Error(retryMsg);
      }
    }

    if (status === 403) throw new Error(serverMsg);
    if (status === 404) throw new Error(`Function "${functionName}" not found. Is it deployed?`);
    if (status === 500) throw new Error(`Server error: ${serverMsg}`);
    if (status === 429) throw new Error('Rate limited. Please wait a moment and try again.');
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      throw new Error('Connection was reset. The function may still be running.');
    }

    throw new Error(serverMsg);
  }
}

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
    const serverMsg = error.response?.data?.error?.message
      || error.response?.data?.error
      || error.message
      || `Request failed with status ${status}`;

    if (status === 401 && config.refreshToken) {
      let newToken: string;
      try {
        newToken = await refreshAuthToken(config.refreshToken);
      } catch {
        setConfigValue('loggedIn', false);
        throw new Error('Session expired. Run `bob login` again.');
      }

      try {
        const retry = await axios.post(
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
        return retry.data?.data || retry.data;
      } catch (retryError: any) {
        const retryStatus = retryError.response?.status;
        const retryMsg = retryError.response?.data?.error?.message || retryError.message;
        if (retryStatus === 401) {
          setConfigValue('loggedIn', false);
          throw new Error('Session expired. Run `bob login` again.');
        }
        throw new Error(retryMsg);
      }
    }

    if (status === 403) throw new Error(serverMsg);
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      throw new Error('Connection was reset. The function may still be running — check the web app for the response.');
    }
    if (status === 404) throw new Error(`Function "${functionName}" not found. Is it deployed?`);
    if (status === 500) throw new Error(`Server error: ${serverMsg}`);
    if (status === 429) throw new Error('Rate limited. Please wait a moment and try again.');

    throw new Error(serverMsg);
  }
}

export function isAuthenticated(): boolean {
  const config = getConfig();
  return !!(config.loggedIn && config.authToken);
}
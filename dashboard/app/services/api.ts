
import axios from 'axios';
import { handleError } from './errorHandler';

const rawApiEndpoint = (process.env.NEXT_PUBLIC_API_ENDPOINT || '').trim();
const API_ROOT = rawApiEndpoint.replace(/\/api$/, '').replace(/\/+$/, '');
const API_URL = API_ROOT || '';

const authHeaders = () => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const clearSessionAndGoHome = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  if (window.location.pathname !== '/') {
    window.location.assign('/');
  }
};

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const buildApiUrl = (path: string) => {
  const normalizedPath = path.replace(/^\/+/,'').replace(/\/+/g, '/');
  return `${API_URL}/${normalizedPath}`.replace(/([^:]\/\/)(api\/){2,}/, '$1api/');
};

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearSessionAndGoHome();
    }
    return Promise.reject(error);
  }
);

export const get = async (url: string, params = {}) => {
  try {
    const response = await apiClient.get(url, { params });
    return response.data;
  } catch (error) {
    handleError(error);
    throw error;
  }
};

export const post = async (url: string, data = {}) => {
  try {
    const response = await apiClient.post(url, data);
    return response.data;
  } catch (error) {
    handleError(error);
    throw error;
  }
};

export const put = async (url: string, data = {}) => {
  try {
    const response = await apiClient.put(url, data);
    return response.data;
  } catch (error) {
    console.error('PUT request error:', error);
    throw error;
  }
};

export const del = async (url: string) => {
  try {
    const response = await apiClient.delete(url);
    return response.data;
  } catch (error) {
    console.error('DELETE request error:', error);
    throw error;
  }
};

export default apiClient;

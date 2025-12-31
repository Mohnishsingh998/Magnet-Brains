import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

// Configure axios
axios.defaults.baseURL = API_URL;

// Auth API
export const authAPI = {
  register: (data) => axios.post('/auth/register', data),
  login: (data) => axios.post('/auth/login', data),
  verifyEmail: (token) => axios.get(`/auth/verify-email/${token}`),
  forgotPassword: (email) => axios.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => axios.post(`/auth/reset-password/${token}`, { password }),
  resendVerification: (email) => axios.post('/auth/resend-verification', { email }),
  getMe: () => axios.get('/auth/me')
};

// Task API
export const taskAPI = {
  getTasks: (params) => axios.get('/tasks', { params }),
  getTask: (id) => axios.get(`/tasks/${id}`),
  createTask: (data) => axios.post('/tasks', data),
  updateTask: (id, data) => axios.put(`/tasks/${id}`, data),
  deleteTask: (id) => axios.delete(`/tasks/${id}`),
  addComment: (id, text) => axios.post(`/tasks/${id}/comments`, { text }),
  addAttachment: (id, formData) => axios.post(`/tasks/${id}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  removeAttachment: (taskId, attachmentId) => axios.delete(`/tasks/${taskId}/attachments/${attachmentId}`),
  downloadAttachment: (taskId, attachmentId) => 
    `${API_URL}/tasks/${taskId}/attachments/${attachmentId}/download`
};

// User API
export const userAPI = {
  getUsers: () => axios.get('/users'),
  getUser: (id) => axios.get(`/users/${id}`),
  deleteUser: (id, reassignTo) => axios.delete(`/users/${id}`, { data: { reassignTo } }),
  getUserStats: (id) => axios.get(`/users/${id}/stats`)
};

// Response interceptor for error handling
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default axios;
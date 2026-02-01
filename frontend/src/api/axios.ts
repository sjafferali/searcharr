import axios from 'axios'

// Create axios instance with default configuration
const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds timeout
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Extract error message from response
    if (error.response?.data?.detail) {
      const detail = error.response.data.detail
      if (typeof detail === 'string') {
        error.message = detail
      } else if (Array.isArray(detail)) {
        // Validation errors
        error.message = detail.map((e) => e.msg).join(', ')
      }
    }
    return Promise.reject(error)
  },
)

export default api

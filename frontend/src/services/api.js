import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar userId a todas las peticiones
api.interceptors.request.use(
  (config) => {
    // Obtener userId del localStorage
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        config.headers['x-user-id'] = user.id;
      } catch (error) {
        console.error('Error parsing currentUser from localStorage:', error);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;


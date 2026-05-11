import axios from 'axios';

// Asegurar que baseURL siempre termine en /api
const getBaseURL = () => {
  const envURL = import.meta.env.VITE_API_URL;
  if (!envURL) return '/api';

  // Si la URL no termina en /api, agregarlo
  if (envURL.endsWith('/api')) {
    return envURL;
  }
  // Si termina en /, agregar api
  if (envURL.endsWith('/')) {
    return `${envURL}api`;
  }
  // Si no termina en / ni /api, agregar /api
  return `${envURL}/api`;
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token JWT a todas las peticiones
api.interceptors.request.use(
  (config) => {
    // Obtener token del localStorage
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores de autenticación
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message;
    const isAuthError =
      status === 401 ||
      status === 403 ||
      message === 'Token de acceso requerido' ||
      message === 'Token inválido o expirado';

    if (isAuthError) {
      // No redirigir si la petición es al endpoint de login (el error es esperado)
      const isLoginRequest = error.config?.url?.includes('/auth/login');

      if (!isLoginRequest && window.location.pathname !== '/login') {
        // Token inválido o expirado, limpiar y redirigir a login
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

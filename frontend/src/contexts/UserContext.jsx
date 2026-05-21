import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const UserContext = createContext();

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    // 1. Carga inmediata desde localStorage para no mostrar pantalla en blanco
    const savedUser = localStorage.getItem('currentUser');
    const savedToken = localStorage.getItem('authToken');
    if (!savedUser || !savedToken) return;

    setCurrentUser(JSON.parse(savedUser));

    // 2. Refresca desde el servidor para obtener permisos actualizados
    //    (el admin puede haber cambiado permisos mientras la sesión estaba activa)
    api
      .get('/users/me')
      .then((res) => {
        const fresh = res.data;
        setCurrentUser(fresh);
        localStorage.setItem('currentUser', JSON.stringify(fresh));
      })
      .catch(() => {
        // Si falla (token expirado, red, etc.) dejamos los datos de localStorage
        // El interceptor de api.js ya redirige al login si el token es inválido
      });
  }, []);

  const login = (user, token) => {
    setCurrentUser(user);
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('authToken', token);
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
  };

  const updateUser = (updatedUser) => {
    setCurrentUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
  };

  return (
    <UserContext.Provider value={{ currentUser, login, logout, updateUser }}>
      {children}
    </UserContext.Provider>
  );
};

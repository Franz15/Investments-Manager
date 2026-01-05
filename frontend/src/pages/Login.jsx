import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { Wallet } from 'lucide-react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const Login = () => {
  const navigate = useNavigate();
  const { login, currentUser } = useUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Si ya hay un usuario logueado, redirigir al dashboard
    if (currentUser) {
      navigate('/', { replace: true });
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    // Cargar usuarios desde el backend
    const loadUsers = async () => {
      try {
        const defaultUsers = [
          {
            id: 'javier',
            name: 'Javier',
            avatar: '👨',
            color: '#3b82f6',
          },
          {
            id: 'ana',
            name: 'Ana',
            avatar: '👩',
            color: '#ec4899',
          },
        ];
        
        const loadedUsers = await Promise.all(
          defaultUsers.map(async (user) => {
            try {
              const response = await api.get(`/users/me`, {
                headers: { 'x-user-id': user.id }
              });
              return {
                ...user,
                name: response.data.name || user.name,
                avatar: response.data.avatar || user.avatar,
                color: response.data.color || user.color,
              };
            } catch (error) {
              // Si no existe en el backend, usar valores por defecto
              return user;
            }
          })
        );
        setUsers(loadedUsers);
      } catch (error) {
        console.error('Error al cargar usuarios:', error);
      } finally {
        setLoading(false);
      }
    };
    loadUsers();
  }, []);

  const handleSelectUser = async (user) => {
    try {
      // Cargar información actualizada del usuario desde el backend
      const response = await api.get(`/users/me`, {
        headers: { 'x-user-id': user.id }
      });
      const updatedUser = {
        ...user,
        name: response.data.name || user.name,
        avatar: response.data.avatar || user.avatar,
        color: response.data.color || user.color,
      };
      login(updatedUser);
      navigate('/');
    } catch (error) {
      // Si falla, usar el usuario local
      login(user);
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 dark:bg-[#1d1d1f]">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded mb-4" style={{ backgroundColor: 'var(--user-color-600)' }}>
            <Wallet className="h-6 w-6 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
            Investments Manager
          </h1>
          <p className="text-gray-600 dark:text-gray-400 tracking-tight">
            Selecciona tu perfil para continuar
          </p>
        </div>

        <div className="space-y-3">
          {loading ? (
            <LoadingSpinner message="Cargando usuarios..." />
          ) : (
            users.map((user) => (
            <button
              key={user.id}
              onClick={() => handleSelectUser(user)}
              className="w-full card flex items-center gap-4 p-5 transition-colors"
              onMouseEnter={(e) => {
                const isDark = document.documentElement.classList.contains('dark');
                e.currentTarget.style.borderColor = isDark ? 'var(--user-color-600)' : 'var(--user-color-300)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '';
              }}
            >
              <div
                className="w-11 h-11 rounded flex items-center justify-center text-xl"
                style={{ 
                  backgroundColor: `${user.color}15`,
                  border: `1px solid ${user.color}30`
                }}
              >
                {user.avatar}
              </div>
              <div className="flex-1 text-left">
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-0.5">
                  {user.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Hacer clic para iniciar sesión
                </p>
              </div>
              <div className="text-gray-400 dark:text-gray-600">
                →
              </div>
            </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;


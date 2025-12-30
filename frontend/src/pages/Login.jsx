import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Wallet } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const { login, currentUser } = useUser();

  useEffect(() => {
    // Si ya hay un usuario logueado, redirigir al dashboard
    if (currentUser) {
      navigate('/', { replace: true });
    }
  }, [currentUser, navigate]);

  const users = [
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

  const handleSelectUser = (user) => {
    login(user);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900 rounded-full mb-4">
            <Wallet className="h-8 w-8 text-primary-600 dark:text-primary-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Investments Manager
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Selecciona tu perfil para continuar
          </p>
        </div>

        <div className="space-y-4">
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => handleSelectUser(user)}
              className="w-full card hover:shadow-lg transition-all duration-200 hover:scale-105 flex items-center gap-4 p-6"
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
                style={{ backgroundColor: `${user.color}20` }}
              >
                {user.avatar}
              </div>
              <div className="flex-1 text-left">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
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
          ))}
        </div>
      </div>
    </div>
  );
};

export default Login;


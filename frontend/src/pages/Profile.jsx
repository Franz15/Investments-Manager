import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { User, LogOut } from 'lucide-react';

const Profile = () => {
  const { currentUser, logout } = useUser();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Perfil</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Información de tu cuenta</p>
      </div>

      <div className="card max-w-2xl">
        <div className="flex items-center gap-6 mb-6">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center text-5xl"
            style={{ backgroundColor: `${currentUser.color}20` }}
          >
            {currentUser.avatar}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {currentUser.name}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Usuario activo
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">ID de Usuario</span>
            </div>
            <p className="text-gray-900 dark:text-gray-100 font-mono text-sm">
              {currentUser.id}
            </p>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-5 h-5 rounded-full"
                style={{ backgroundColor: currentUser.color }}
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Color del Perfil</span>
            </div>
            <p className="text-gray-900 dark:text-gray-100 font-mono text-sm">
              {currentUser.color}
            </p>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full btn-secondary flex items-center justify-center gap-2"
          >
            <LogOut className="h-5 w-5" />
            Cerrar Sesión
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;




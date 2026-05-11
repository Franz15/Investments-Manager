import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, ChevronDown, ChevronUp, Lock, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import api from '../services/api';
import { useTranslation } from '../contexts/TranslationContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ES from 'country-flag-icons/react/3x2/ES';
import CataloniaFlagSvg from '../assets/flag-catalonia.svg';

// Componente para la bandera de Cataluña usando el SVG local
const CataloniaFlag = ({ className }) => (
  <img src={CataloniaFlagSvg} alt="Bandera de Cataluña" className={className} />
);

const Profile = () => {
  const { currentUser, logout, updateUser } = useUser();
  const { t, language, setLanguage } = useTranslation();
  const navigate = useNavigate();
  const [selectedColor, setSelectedColor] = useState(currentUser?.color || '#3b82f6');
  const [isSaving, setIsSaving] = useState(false);
  const [showCustomColor, setShowCustomColor] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleColorChange = async (color) => {
    setSelectedColor(color);
    setIsSaving(true);
    try {
      const response = await api.patch('/users/me/color', { color });
      updateUser({ ...currentUser, color: response.data.color });
    } catch (error) {
      console.error('Error al actualizar el color:', error);
      alert(t('profile.updateColorError'));
      setSelectedColor(currentUser?.color || '#3b82f6');
    } finally {
      setIsSaving(false);
    }
  };

  // Colores predefinidos
  const predefinedColors = [
    '#3b82f6', // Azul
    '#ec4899', // Rosa
    '#10b981', // Verde
    '#f59e0b', // Amarillo/Naranja
    '#ef4444', // Rojo
    '#8b5cf6', // Púrpura
    '#06b6d4', // Cyan
    '#84cc16', // Lima
    '#f97316', // Naranja
    '#6366f1', // Índigo
  ];

  const handleLanguageChange = (newLanguage) => {
    setLanguage(newLanguage);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError(t('profile.passwordMismatch'));
      return;
    }

    if (newPassword.length < 4) {
      setPasswordError('La nueva contraseña debe tener al menos 4 caracteres');
      return;
    }

    setIsChangingPassword(true);
    try {
      await api.patch('/users/me/password', {
        currentPassword,
        newPassword,
      });
      setPasswordSuccess(t('profile.passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowChangePassword(false);
        setPasswordSuccess('');
      }, 2000);
    } catch (error) {
      setPasswordError(error.response?.data?.message || t('profile.changePasswordError'));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const languages = [
    { code: 'es', name: t('profile.spanish'), flag: 'ES' },
    { code: 'cat', name: t('profile.catalan'), flag: 'ES-CT' },
  ];

  if (!currentUser) {
    return <LoadingSpinner />;
  }

  const canChangePassword = currentUser?.permissions?.canChangePassword !== false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          {t('profile.title')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">{t('profile.subtitle')}</p>
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
            <p className="text-gray-500 dark:text-gray-400 mt-1">{t('profile.userName')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
            <div className="flex items-center gap-3 mb-2">
              <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('profile.userId')}
              </span>
            </div>
            <p className="text-gray-900 dark:text-gray-100 font-mono text-sm">{currentUser.id}</p>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700"></div>

          {/* Selector de Idioma */}
          <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded px-4 py-2">
            <div className="flex items-center justify-between relative">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('profile.language')}
              </span>
              <div className="relative">
                <button
                  onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#2c2c2e] rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#404040] transition-colors"
                >
                  {(() => {
                    const currentLang = languages.find((l) => l.code === language);
                    const FlagComponent =
                      currentLang?.flag === 'ES'
                        ? ES
                        : currentLang?.flag === 'ES-CT'
                          ? CataloniaFlag
                          : null;
                    return (
                      <>
                        {FlagComponent && <FlagComponent className="w-4 h-3" />}
                        <span>{currentLang?.name || t('profile.spanish')}</span>
                        <ChevronDown
                          className={`h-3 w-3 transition-transform ${showLanguageDropdown ? 'rotate-180' : ''}`}
                        />
                      </>
                    );
                  })()}
                </button>
                {showLanguageDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowLanguageDropdown(false)}
                    />
                    <div className="absolute right-0 mt-1 z-20 bg-white dark:bg-[#2c2c2e] rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg min-w-[140px] overflow-hidden">
                      {languages.map((lang) => {
                        const FlagComponent =
                          lang.flag === 'ES' ? ES : lang.flag === 'ES-CT' ? CataloniaFlag : null;
                        return (
                          <button
                            key={lang.code}
                            onClick={() => {
                              handleLanguageChange(lang.code);
                              setShowLanguageDropdown(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                              language === lang.code
                                ? 'bg-gray-100 dark:bg-[#404040] text-gray-900 dark:text-gray-100'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#404040]'
                            }`}
                          >
                            {FlagComponent && <FlagComponent className="w-4 h-3" />}
                            <span className="flex-1 text-left">{lang.name}</span>
                            {language === lang.code && (
                              <span className="text-gray-600 dark:text-gray-400">✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700"></div>

          <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-5 h-5 rounded-full"
                style={{ backgroundColor: currentUser.color }}
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('profile.profileColor')}
              </span>
            </div>

            {/* Selector de colores predefinidos */}
            <div className="mb-4">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                {t('profile.predefinedColors')}:
              </p>
              <div className="flex flex-wrap gap-2">
                {predefinedColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleColorChange(color)}
                    disabled={isSaving}
                    className={`w-10 h-10 rounded-full border-2 transition-all ${
                      selectedColor === color
                        ? 'border-gray-900 dark:border-gray-100 scale-110'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-500 dark:hover:border-gray-400'
                    } ${isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>

            {/* Selector de color personalizado - Desplegable */}
            <div>
              <button
                onClick={() => setShowCustomColor(!showCustomColor)}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors mb-2"
              >
                {showCustomColor ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    <span>{t('profile.hideCustomColor')}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    <span>{t('profile.showCustomColor')}</span>
                  </>
                )}
              </button>

              {showCustomColor && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    {t('profile.customColor')}:
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={selectedColor}
                      onChange={(e) => setSelectedColor(e.target.value)}
                      disabled={isSaving}
                      className="w-16 h-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <input
                      type="text"
                      value={selectedColor}
                      onChange={(e) => setSelectedColor(e.target.value)}
                      disabled={isSaving}
                      className="flex-1 input-field font-mono text-sm"
                      placeholder="#3b82f6"
                    />
                    <button
                      onClick={() => handleColorChange(selectedColor)}
                      disabled={isSaving || selectedColor === currentUser.color}
                      className="px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: 'var(--user-color-600)' }}
                      onMouseEnter={(e) =>
                        !e.currentTarget.disabled &&
                        (e.currentTarget.style.backgroundColor = 'var(--user-color-700)')
                      }
                      onMouseLeave={(e) =>
                        !e.currentTarget.disabled &&
                        (e.currentTarget.style.backgroundColor = 'var(--user-color-600)')
                      }
                    >
                      {isSaving ? t('common.loading') : t('common.save')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700"></div>

          {/* Cambio de Contraseña */}
          <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
            <div className="flex items-center gap-3 mb-4 w-full text-left">
              <Lock className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('profile.changePassword')}
              </span>
            </div>

            {!canChangePassword ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('profile.changePasswordDisabled') ||
                  'El cambio de contraseña está deshabilitado para esta cuenta. Contacta con el administrador.'}
              </p>
            ) : (
              <>
                <button
                  onClick={() => {
                    setShowChangePassword(!showChangePassword);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setPasswordError('');
                    setPasswordSuccess('');
                  }}
                  className="flex items-center gap-3 mb-4 w-full text-left text-xs text-gray-600 dark:text-gray-400"
                >
                  <span>
                    {t('profile.changePasswordToggle') ||
                      'Mostrar/ocultar formulario de cambio de contraseña'}
                  </span>
                  {showChangePassword ? (
                    <ChevronUp className="h-4 w-4 ml-auto text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 ml-auto text-gray-400" />
                  )}
                </button>

                {showChangePassword && (
                  <form onSubmit={handleChangePassword} className="space-y-4 mt-4">
                    <div>
                      <label
                        htmlFor="currentPassword"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                      >
                        {t('profile.currentPassword')}
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          id="currentPassword"
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full input-field pl-10 pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          {showCurrentPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="newPassword"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                      >
                        {t('profile.newPassword')}
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          id="newPassword"
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full input-field pl-10 pr-10"
                          required
                          minLength={4}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          {showNewPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="confirmPassword"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                      >
                        {t('profile.confirmPassword')}
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full input-field pl-10 pr-10"
                          required
                          minLength={4}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {passwordError && (
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                        {passwordError}
                      </div>
                    )}

                    {passwordSuccess && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm">
                        {passwordSuccess}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={
                        isChangingPassword || !currentPassword || !newPassword || !confirmPassword
                      }
                      className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: 'var(--user-color-600)' }}
                      onMouseEnter={(e) =>
                        !e.currentTarget.disabled &&
                        (e.currentTarget.style.backgroundColor = 'var(--user-color-700)')
                      }
                      onMouseLeave={(e) =>
                        !e.currentTarget.disabled &&
                        (e.currentTarget.style.backgroundColor = 'var(--user-color-600)')
                      }
                    >
                      {isChangingPassword ? (
                        <>
                          <LoadingSpinner message="" />
                          <span>{t('common.loading')}</span>
                        </>
                      ) : (
                        t('common.save')
                      )}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full btn-secondary flex items-center justify-center gap-2"
          >
            <LogOut className="h-5 w-5" />
            {t('sidebar.logout')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;

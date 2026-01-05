import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, ChevronDown, ChevronUp } from 'lucide-react';
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
      alert('Error al actualizar el color');
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

  const languages = [
    { code: 'es', name: 'Español', flag: 'ES' },
    { code: 'cat', name: 'Català', flag: 'ES-CT' },
  ];

  if (!currentUser) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('profile.title')}</h1>
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
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {t('profile.userName')}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
            <div className="flex items-center gap-3 mb-2">
              <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('profile.userId')}</span>
            </div>
            <p className="text-gray-900 dark:text-gray-100 font-mono text-sm">
              {currentUser.id}
            </p>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700"></div>

          {/* Selector de Idioma */}
          <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded px-4 py-2">
            <div className="flex items-center justify-between relative">
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('profile.language')}</span>
              <div className="relative">
                <button
                  onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#2c2c2e] rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#404040] transition-colors"
                >
                  {(() => {
                    const currentLang = languages.find(l => l.code === language);
                    const FlagComponent = currentLang?.flag === 'ES' ? ES : currentLang?.flag === 'ES-CT' ? CataloniaFlag : null;
                    return (
                      <>
                        {FlagComponent && <FlagComponent className="w-4 h-3" />}
                        <span>{currentLang?.name || 'Español'}</span>
                        <ChevronDown className={`h-3 w-3 transition-transform ${showLanguageDropdown ? 'rotate-180' : ''}`} />
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
                        const FlagComponent = lang.flag === 'ES' ? ES : lang.flag === 'ES-CT' ? CataloniaFlag : null;
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
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('profile.profileColor')}</span>
            </div>
            
            {/* Selector de colores predefinidos */}
            <div className="mb-4">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">{t('profile.predefinedColors')}:</p>
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
                    <span>Ocultar color personalizado</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    <span>Mostrar color personalizado</span>
                  </>
                )}
              </button>
              
              {showCustomColor && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{t('profile.customColor')}:</p>
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
                      onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = 'var(--user-color-700)')}
                      onMouseLeave={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = 'var(--user-color-600)')}
                    >
                      {isSaving ? t('common.loading') : t('common.save')}
                    </button>
                  </div>
                </div>
              )}
            </div>
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




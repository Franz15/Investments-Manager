import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle = () => {
  const { isDark, toggleTheme } = useTheme();

  const handleClick = () => {
    console.log('Toggle clicked, current theme:', isDark ? 'dark' : 'light');
    toggleTheme();
    console.log('After toggle, new theme should be:', !isDark ? 'dark' : 'light');
    // Verificar inmediatamente después
    setTimeout(() => {
      console.log('HTML classes:', document.documentElement.className);
      console.log('Has dark class?', document.documentElement.classList.contains('dark'));
    }, 100);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
};

export default ThemeToggle;




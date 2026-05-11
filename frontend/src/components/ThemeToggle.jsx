import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle = () => {
  const { isDark, toggleTheme } = useTheme();

  const handleClick = () => {
    toggleTheme();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="relative p-2 rounded hover:bg-gray-100 dark:hover:bg-[#404040] text-gray-600 dark:text-gray-400 transition-colors duration-200"
      aria-label="Toggle theme"
    >
      <div className="relative">
        <Sun
          size={18}
          strokeWidth={2}
          className={`absolute inset-0 transition-all duration-300 ${isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'}`}
        />
        <Moon
          size={18}
          strokeWidth={2}
          className={`transition-all duration-300 ${isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'}`}
        />
      </div>
    </button>
  );
};

export default ThemeToggle;

const LoadingSpinner = ({ message = 'Cargando...' }) => {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--user-color-500)', borderTopColor: 'transparent' }}></div>
        <div className="text-gray-500 dark:text-gray-400 font-medium">{message}</div>
      </div>
    </div>
  );
};

export default LoadingSpinner;

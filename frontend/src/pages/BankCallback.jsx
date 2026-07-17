import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

// Página de retorno del banco: /bank-callback?code=...&state=...
const BankCallback = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const done = useRef(false); // StrictMode monta dos veces; el code solo vale una vez

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const code = params.get('code');
    const state = params.get('state');

    if (!code || !state) {
      setError(params.get('error') || 'Autorización cancelada o inválida');
      return;
    }

    api
      .post('/bank-connections/complete', { code, state })
      .then(() => navigate('/accounts', { replace: true }))
      .catch((err) =>
        setError(err.response?.data?.message || 'Error completando la conexión con el banco')
      );
  }, [params, navigate]);

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={() => navigate('/accounts')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
        >
          Volver a cuentas
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 flex items-center gap-3">
      <LoadingSpinner />
      <span>Completando la conexión con tu banco…</span>
    </div>
  );
};

export default BankCallback;

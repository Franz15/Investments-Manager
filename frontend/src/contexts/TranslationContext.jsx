import { createContext, useContext, useState, useEffect } from 'react';
import esTranslationsData from '../translations/es.json';
import catTranslationsData from '../translations/cat.json';

const TranslationContext = createContext();

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
};

export const TranslationProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    // Intentar obtener el idioma guardado en localStorage, por defecto 'es'
    return localStorage.getItem('language') || 'es';
  });
  const [translations, setTranslations] = useState(() => {
    // Inicializar con las traducciones según el idioma guardado
    const savedLanguage = localStorage.getItem('language') || 'es';
    if (savedLanguage === 'cat') {
      return catTranslationsData || {};
    }
    return esTranslationsData || {};
  });

  useEffect(() => {
    // Guardar el idioma en localStorage cuando cambie
    localStorage.setItem('language', language);
    
    // Cargar traducciones según el idioma
    const loadTranslations = async () => {
      try {
        if (language === 'es') {
          setTranslations(esTranslationsData || {});
        } else if (language === 'cat') {
          setTranslations(catTranslationsData || {});
        } else {
          // Fallback a español por defecto
          setTranslations(esTranslationsData || {});
        }
      } catch (error) {
        console.error('Error loading translations:', error);
        setTranslations(esTranslationsData || {}); // Fallback a español
      }
    };

    loadTranslations();
  }, [language]);

  const t = (key, params = {}) => {
    if (!translations || typeof translations !== 'object') {
      console.warn('Translations not loaded yet');
      return key;
    }

    const keys = key.split('.');
    let value = translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        console.warn(`Translation key not found: ${key}`);
        return key; // Devolver la clave si no se encuentra la traducción
      }
    }

    // Reemplazar parámetros si existen
    if (typeof value === 'string' && Object.keys(params).length > 0) {
      return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
        return params[paramKey] !== undefined ? params[paramKey] : match;
      });
    }

    return value || key;
  };

  return (
    <TranslationContext.Provider value={{ t, language, setLanguage }}>
      {children}
    </TranslationContext.Provider>
  );
};

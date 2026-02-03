import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import esTranslationsData from "../translations/es.json";
import catTranslationsData from "../translations/cat.json";
import { useUser } from "./UserContext";
import api from "../services/api";

const defaultT = (key) => key;

const TranslationContext = createContext({
  t: defaultT,
  language: "es",
  setLanguage: () => {},
});

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context || !context.t) {
    return {
      t: defaultT,
      language: "es",
      setLanguage: () => {},
    };
  }
  return context;
};

export const TranslationProvider = ({ children }) => {
  const { currentUser, updateUser } = useUser();

  const [language, setLanguageState] = useState(() => {
    return currentUser?.language || "es";
  });
  const [translations, setTranslations] = useState(() => {
    const lang = currentUser?.language || "es";
    return lang === "cat"
      ? catTranslationsData || {}
      : esTranslationsData || {};
  });

  // Al cambiar de usuario (login o restore), usar su idioma guardado
  useEffect(() => {
    if (currentUser?.language) {
      setLanguageState(currentUser.language);
    } else {
      setLanguageState("es");
    }
  }, [currentUser?.id]);

  // Cargar traducciones cuando cambie el idioma
  useEffect(() => {
    if (language === "cat") {
      setTranslations(catTranslationsData || {});
    } else {
      setTranslations(esTranslationsData || {});
    }
  }, [language]);

  const setLanguage = useCallback(
    async (newLanguage) => {
      if (!["es", "cat"].includes(newLanguage)) return;
      setLanguageState(newLanguage);

      if (currentUser) {
        try {
          await api.patch("/users/me/language", { language: newLanguage });
          updateUser({ ...currentUser, language: newLanguage });
        } catch (err) {
          console.error("Error al guardar idioma:", err);
        }
      }
    },
    [currentUser, updateUser],
  );

  const t = (key, params = {}) => {
    if (!translations || typeof translations !== "object") return key;
    const keys = key.split(".");
    let value = translations;
    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        return key;
      }
    }
    if (typeof value === "string" && Object.keys(params).length > 0) {
      return value.replace(/\{(\w+)\}/g, (match, paramKey) =>
        params[paramKey] !== undefined ? params[paramKey] : match,
      );
    }
    return value || key;
  };

  return (
    <TranslationContext.Provider value={{ t, language, setLanguage }}>
      {children}
    </TranslationContext.Provider>
  );
};

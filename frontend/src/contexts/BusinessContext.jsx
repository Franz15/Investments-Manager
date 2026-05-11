import { createContext, useContext, useState, useEffect } from "react";
import api from "../services/api";

const BusinessContext = createContext();

export const BusinessProvider = ({ children }) => {
  const [selectedBusiness, setSelectedBusiness] = useState(() => {
    const saved = localStorage.getItem("selectedBusiness");
    return saved ? JSON.parse(saved) : null; // null = lista, "personal" = personal, businessId = negocio
  });
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (token) fetchBusinesses();
    else setLoading(false);
  }, []);

  useEffect(() => {
    localStorage.setItem("selectedBusiness", JSON.stringify(selectedBusiness));
  }, [selectedBusiness]);

  const fetchBusinesses = async () => {
    try {
      const response = await api.get("/businesses");
      setBusinesses(response.data);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const selectBusiness = (businessId) => {
    setSelectedBusiness(businessId);
  };

  const value = {
    selectedBusiness,
    selectBusiness,
    businesses,
    loading,
    refreshBusinesses: fetchBusinesses,
  };

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
};

export const useBusiness = () => {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error("useBusiness must be used within a BusinessProvider");
  }
  return context;
};

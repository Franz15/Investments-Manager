import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  AlertCircle,
  Menu,
  X,
  User,
  LogOut,
  Building2,
  ShieldCheck,
  Briefcase,
  PiggyBank,
} from "lucide-react";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { useUserColor } from "../hooks/useUserColor";
import { useTranslation } from "../contexts/TranslationContext";
import { useBusiness } from "../contexts/BusinessContext";
import ThemeToggle from "./ThemeToggle";
import packageJson from "../../package.json";

const Layout = ({ children }) => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved ? JSON.parse(saved) : false;
  });
  const { currentUser, logout } = useUser();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { businesses, selectedBusiness, selectBusiness } = useBusiness();
  const [businessesExpanded, setBusinessesExpanded] = useState(() => {
    const saved = localStorage.getItem("businessesExpanded");
    return saved ? JSON.parse(saved) : false;
  });
  useUserColor(); // Aplicar color del usuario como variables CSS

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem(
      "businessesExpanded",
      JSON.stringify(businessesExpanded),
    );
  }, [businessesExpanded]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isAdmin = currentUser?.role === "admin" || currentUser?.id === "javier";

  const hasPortfolioBuilderAccess =
    isAdmin ||
    (currentUser?.permissions?.portfolioBuilder &&
      currentUser?.id !== "test-dca");

  const investmentsSection = [
    { name: t("sidebar.dashboard"), href: "/", icon: LayoutDashboard },
    { name: t("sidebar.accounts"), href: "/accounts", icon: Wallet },
    { name: t("sidebar.investments"), href: "/investments", icon: TrendingUp },
    { name: t("sidebar.debts"), href: "/debts", icon: AlertCircle },
  ];

  const financesSection = [
    { name: t("sidebar.finances"), href: "/finances", icon: PiggyBank },
  ];

  const navigation = [
    ...investmentsSection,
    ...financesSection,
    ...(hasPortfolioBuilderAccess
      ? [{ name: t("sidebar.portfolioBuilder"), href: "/portfolio-builder", icon: Building2 }]
      : []),
    ...(isAdmin
      ? [{ name: t("sidebar.adminAccess") || "Gestión accesos", href: "/admin/access", icon: ShieldCheck }]
      : []),
    {
      name: currentUser?.name || t("sidebar.profile"),
      href: "/profile",
      icon: User,
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-[#1d1d1f]">
      {/* Sidebar móvil */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-300 ${sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
        <div
          className={`fixed inset-y-0 left-0 flex w-72 flex-col bg-white/70 dark:bg-[#2c2c2e]/70 backdrop-blur-2xl border-r border-gray-200/30 dark:border-[#404040]/30 transform transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{ backdropFilter: "blur(20px) saturate(180%)" }}
        >
          <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200 dark:border-[#404040]">
            <div className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded flex items-center justify-center"
                style={{ backgroundColor: "var(--user-color-600)" }}
              >
                <Wallet className="h-4 w-4 text-white" strokeWidth={2} />
              </div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                {t("sidebar.appName")}
              </h1>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-[#404040] text-gray-500 dark:text-gray-400 transition-colors"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          <nav className="flex-1 space-y-2 px-4 py-6 overflow-y-auto">
            {/* Sección Inversiones */}
            <div className="px-2 py-1 mb-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t("sidebar.investmentsSection")}
              </span>
            </div>
            {investmentsSection.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`sidebar-link group ${isActive ? "sidebar-link-active" : "sidebar-link-inactive"}`}
                >
                  <Icon
                    className={`mr-3 h-4 w-4 transition-colors ${isActive ? "" : "text-gray-500 dark:text-gray-400"}`}
                    style={isActive ? { color: "var(--user-color-600)" } : {}}
                    strokeWidth={2}
                  />
                  <span className="flex-1">{item.name}</span>
                  {isActive && (
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: "var(--user-color-600)" }}
                    ></div>
                  )}
                </Link>
              );
            })}

            {/* Separador */}
            <div className="my-4 border-t border-gray-200 dark:border-gray-700"></div>

            {/* Sección Finanzas */}
            <div className="px-2 py-1 mb-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t("sidebar.financesSection")}
              </span>
            </div>
            {financesSection.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`sidebar-link group ${isActive ? "sidebar-link-active" : "sidebar-link-inactive"}`}
                >
                  <Icon
                    className={`mr-3 h-4 w-4 transition-colors ${isActive ? "" : "text-gray-500 dark:text-gray-400"}`}
                    style={isActive ? { color: "var(--user-color-600)" } : {}}
                    strokeWidth={2}
                  />
                  <span className="flex-1">{item.name}</span>
                  {isActive && (
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: "var(--user-color-600)" }}
                    ></div>
                  )}
                </Link>
              );
            })}

            {/* Negocios desplegable */}
            <div>
              <button
                onClick={() => {
                  setBusinessesExpanded(!businessesExpanded);
                  if (!businessesExpanded) {
                    navigate("/businesses");
                  }
                }}
                className={`sidebar-link group w-full text-left ${
                  location.pathname === "/businesses" ||
                  (selectedBusiness !== null && selectedBusiness !== undefined)
                    ? "sidebar-link-active"
                    : "sidebar-link-inactive"
                }`}
              >
                <Briefcase
                  className={`mr-3 h-4 w-4 transition-colors ${
                    location.pathname === "/businesses" ||
                    (selectedBusiness !== null &&
                      selectedBusiness !== undefined)
                      ? ""
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                  style={
                    location.pathname === "/businesses" ||
                    (selectedBusiness !== null &&
                      selectedBusiness !== undefined)
                      ? { color: "var(--user-color-600)" }
                      : {}
                  }
                  strokeWidth={2}
                />
                <span className="flex-1">{t("sidebar.businesses")}</span>
                {businessesExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                )}
              </button>
              {businessesExpanded && (
                <div className="ml-4 mt-1 space-y-1">
                  {/* Personal */}
                  <button
                    onClick={() => {
                      selectBusiness("personal");
                      navigate("/businesses");
                      setSidebarOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                      selectedBusiness === "personal"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    <User className="h-3 w-3" />
                    {t("businesses.personal")}
                  </button>
                  {/* Lista de negocios */}
                  {businesses
                    .filter((b) => b.isActive)
                    .map((business) => (
                      <button
                        key={business._id}
                        onClick={() => {
                          selectBusiness(business._id);
                          navigate("/businesses");
                          setSidebarOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                          selectedBusiness === business._id
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                        style={
                          selectedBusiness === business._id
                            ? {
                                backgroundColor: `${business.color}20`,
                                color: business.color,
                              }
                            : {}
                        }
                      >
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: business.color }}
                        ></div>
                        {business.name}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Separador */}
            <div className="my-4 border-t border-gray-200 dark:border-gray-700"></div>

            {/* Perfil */}
            {navigation
              .filter((item) => item.href === "/profile")
              .map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`sidebar-link group ${isActive ? "sidebar-link-active" : "sidebar-link-inactive"}`}
                  >
                    <Icon
                      className={`mr-3 h-4 w-4 transition-colors ${isActive ? "" : "text-gray-500 dark:text-gray-400"}`}
                      style={isActive ? { color: "var(--user-color-600)" } : {}}
                      strokeWidth={2}
                    />
                    <span className="flex-1">{item.name}</span>
                    {isActive && (
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: "var(--user-color-600)" }}
                      ></div>
                    )}
                  </Link>
                );
              })}
          </nav>
          {currentUser && (
            <div className="p-4 border-t border-gray-200 dark:border-[#404040]">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-[#404040] transition-colors text-left opacity-70 hover:opacity-100"
              >
                <LogOut className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t("sidebar.logout")}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar desktop */}
      <div
        className={`hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "lg:w-20" : "lg:w-64"}`}
      >
        <div
          className="flex flex-col flex-grow bg-white/70 dark:bg-[#2c2c2e]/70 backdrop-blur-2xl border-r border-gray-200/30 dark:border-[#404040]/30"
          style={{ backdropFilter: "blur(20px) saturate(180%)" }}
        >
          <div
            className={`flex h-16 items-center justify-between border-b border-gray-200/50 dark:border-[#404040]/50 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "px-2" : "px-6"}`}
          >
            <div
              className={`flex items-center transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "w-full justify-center gap-0" : "flex-1 gap-3"}`}
            >
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className={`rounded flex items-center justify-center transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] cursor-pointer flex-shrink-0 ${sidebarCollapsed ? "w-7 h-7" : "w-10 h-10"}`}
                style={{
                  backgroundColor: "var(--user-color-600)",
                }}
                onMouseEnter={(e) =>
                  (e.target.style.backgroundColor = "var(--user-color-700)")
                }
                onMouseLeave={(e) =>
                  (e.target.style.backgroundColor = "var(--user-color-600)")
                }
                aria-label={
                  sidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"
                }
              >
                <Wallet
                  className={`text-white transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "h-4 w-4" : "h-6 w-6"}`}
                  strokeWidth={2}
                />
              </button>
              <h1
                className={`text-lg font-semibold text-gray-900 dark:text-gray-100 tracking-tight transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden whitespace-nowrap ${sidebarCollapsed ? "max-w-0 opacity-0 scale-95" : "max-w-[200px] opacity-100 scale-100"}`}
              >
                {t("sidebar.appName")}
              </h1>
            </div>
            <div
              className={`flex items-center transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "max-w-0 opacity-0 scale-95 overflow-hidden" : "max-w-[50px] opacity-100 scale-100"}`}
            >
              <ThemeToggle />
            </div>
          </div>
          <nav
            className={`flex-1 space-y-2 overflow-y-auto transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "px-2 py-6" : "px-4 py-6"}`}
          >
            {/* Sección Inversiones */}
            {!sidebarCollapsed && (
              <div className="px-2 py-1 mb-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t("sidebar.investmentsSection")}
                </span>
              </div>
            )}
            {investmentsSection.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`sidebar-link group ${isActive ? "sidebar-link-active" : "sidebar-link-inactive"} transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "justify-center px-0" : ""}`}
                  title={sidebarCollapsed ? item.name : ""}
                >
                  <Icon
                    className={`transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 ${!isActive ? "text-gray-500 dark:text-gray-400" : ""} ${sidebarCollapsed ? "h-5 w-5 mx-0" : "mr-3 h-4 w-4"}`}
                    style={isActive ? { color: "var(--user-color-600)" } : {}}
                    strokeWidth={2}
                  />
                  <span
                    className={`flex-1 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden whitespace-nowrap ${sidebarCollapsed ? "max-w-0 opacity-0 translate-x-2" : "max-w-[150px] opacity-100 translate-x-0"}`}
                  >
                    {item.name}
                  </span>
                  <div
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 ${isActive && !sidebarCollapsed ? "opacity-100 scale-100" : "opacity-0 scale-0"}`}
                    style={{ backgroundColor: "var(--user-color-600)" }}
                  ></div>
                </Link>
              );
            })}

            {/* Separador */}
            {!sidebarCollapsed && (
              <div className="my-4 border-t border-gray-200 dark:border-gray-700"></div>
            )}

            {/* Sección Finanzas */}
            {!sidebarCollapsed && (
              <div className="px-2 py-1 mb-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t("sidebar.financesSection")}
                </span>
              </div>
            )}
            {financesSection.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`sidebar-link group ${isActive ? "sidebar-link-active" : "sidebar-link-inactive"} transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "justify-center px-0" : ""}`}
                  title={sidebarCollapsed ? item.name : ""}
                >
                  <Icon
                    className={`transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 ${!isActive ? "text-gray-500 dark:text-gray-400" : ""} ${sidebarCollapsed ? "h-5 w-5 mx-0" : "mr-3 h-4 w-4"}`}
                    style={isActive ? { color: "var(--user-color-600)" } : {}}
                    strokeWidth={2}
                  />
                  <span
                    className={`flex-1 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden whitespace-nowrap ${sidebarCollapsed ? "max-w-0 opacity-0 translate-x-2" : "max-w-[150px] opacity-100 translate-x-0"}`}
                  >
                    {item.name}
                  </span>
                  <div
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 ${isActive && !sidebarCollapsed ? "opacity-100 scale-100" : "opacity-0 scale-0"}`}
                    style={{ backgroundColor: "var(--user-color-600)" }}
                  ></div>
                </Link>
              );
            })}

            {/* Negocios desplegable */}
            {!sidebarCollapsed && (
              <div>
                <button
                  onClick={() => {
                    setBusinessesExpanded(!businessesExpanded);
                    if (!businessesExpanded) {
                      navigate("/businesses");
                    }
                  }}
                  className={`sidebar-link group w-full text-left ${
                    location.pathname === "/businesses" ||
                    (selectedBusiness !== null &&
                      selectedBusiness !== undefined)
                      ? "sidebar-link-active"
                      : "sidebar-link-inactive"
                  } transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]`}
                >
                  <Briefcase
                    className={`transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 ${
                      location.pathname === "/businesses" ||
                      (selectedBusiness !== null &&
                        selectedBusiness !== undefined)
                        ? ""
                        : "text-gray-500 dark:text-gray-400"
                    } mr-3 h-4 w-4`}
                    style={
                      location.pathname === "/businesses" ||
                      (selectedBusiness !== null &&
                        selectedBusiness !== undefined)
                        ? { color: "var(--user-color-600)" }
                        : {}
                    }
                    strokeWidth={2}
                  />
                  <span className="flex-1">{t("sidebar.businesses")}</span>
                  {businessesExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  )}
                </button>
                {businessesExpanded && (
                  <div className="ml-4 mt-1 space-y-1">
                    {/* Personal */}
                    <button
                      onClick={() => {
                        selectBusiness("personal");
                        navigate("/businesses");
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                        selectedBusiness === "personal"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      <User className="h-3 w-3" />
                      {t("businesses.personal")}
                    </button>
                    {/* Lista de negocios */}
                    {businesses
                      .filter((b) => b.isActive)
                      .map((business) => (
                        <button
                          key={business._id}
                          onClick={() => {
                            selectBusiness(business._id);
                            navigate("/businesses");
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                            selectedBusiness === business._id
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                          }`}
                          style={
                            selectedBusiness === business._id
                              ? {
                                  backgroundColor: `${business.color}20`,
                                  color: business.color,
                                }
                              : {}
                          }
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: business.color }}
                          ></div>
                          {business.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
            {sidebarCollapsed && (
              <Link
                to="/businesses"
                className="sidebar-link group sidebar-link-inactive justify-center px-0"
                title={t("sidebar.businesses")}
              >
                <Briefcase
                  className="h-5 w-5 mx-0 text-gray-500 dark:text-gray-400"
                  strokeWidth={2}
                />
              </Link>
            )}

            {/* Separador */}
            {!sidebarCollapsed && (
              <div className="my-4 border-t border-gray-200 dark:border-gray-700"></div>
            )}

            {/* Perfil */}
            {navigation
              .filter((item) => item.href === "/profile")
              .map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`sidebar-link group ${isActive ? "sidebar-link-active" : "sidebar-link-inactive"} transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "justify-center px-0" : ""}`}
                    title={sidebarCollapsed ? item.name : ""}
                  >
                    <Icon
                      className={`transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 ${!isActive ? "text-gray-500 dark:text-gray-400" : ""} ${sidebarCollapsed ? "h-5 w-5 mx-0" : "mr-3 h-4 w-4"}`}
                      style={isActive ? { color: "var(--user-color-600)" } : {}}
                      strokeWidth={2}
                    />
                    <span
                      className={`flex-1 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden whitespace-nowrap ${sidebarCollapsed ? "max-w-0 opacity-0 translate-x-2" : "max-w-[150px] opacity-100 translate-x-0"}`}
                    >
                      {item.name}
                    </span>
                    <div
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 ${isActive && !sidebarCollapsed ? "opacity-100 scale-100" : "opacity-0 scale-0"}`}
                      style={{ backgroundColor: "var(--user-color-600)" }}
                    ></div>
                  </Link>
                );
              })}
          </nav>
          {currentUser && (
            <div
              className={`p-4 border-t border-gray-200/50 dark:border-[#404040]/50 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "px-2" : ""}`}
            >
              <button
                onClick={handleLogout}
                className={`w-full flex items-center rounded hover:bg-gray-100/50 dark:hover:bg-[#404040]/50 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] opacity-70 hover:opacity-100 ${sidebarCollapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"} text-gray-500 dark:text-gray-400`}
                title={sidebarCollapsed ? t("sidebar.logout") : ""}
              >
                <LogOut
                  className={`transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 ${sidebarCollapsed ? "h-5 w-5 mx-0" : "mr-3 h-6 w-6"}`}
                  strokeWidth={2}
                />
                <span
                  className={`flex-1 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden whitespace-nowrap ${sidebarCollapsed ? "max-w-0 opacity-0 translate-x-2" : "max-w-[150px] opacity-100 translate-x-0 text-xs"}`}
                >
                  {t("sidebar.logout")}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contenido principal */}
      <div
        className={`transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "lg:pl-20" : "lg:pl-64"}`}
      >
        {/* Header móvil */}
        <div
          className="sticky top-0 z-30 flex h-16 bg-white/70 dark:bg-[#2c2c2e]/70 backdrop-blur-2xl border-b border-gray-200/30 dark:border-[#404040]/30 lg:hidden"
          style={{ backdropFilter: "blur(20px) saturate(180%)" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="px-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none transition-colors"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center justify-between flex-1 px-4">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t("sidebar.appName")}
            </h1>
            <ThemeToggle />
          </div>
        </div>

        {/* Contenido */}
        <main className="p-8 pb-20 mb-2">{children}</main>

        {/* Footer */}
        <footer
          className={`fixed bottom-0 right-0 z-40 border-t border-gray-200/30 dark:border-[#404040]/30 bg-white/50 dark:bg-[#2c2c2e]/70 backdrop-blur-2xl transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "lg:left-20" : "lg:left-64"} left-0`}
          style={{
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
          }}
        >
          <div className="px-4 py-3">
            <div className="flex items-center justify-end max-w-7xl mx-auto">
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-600 dark:text-gray-400">
                  {t("sidebar.appName")}
                </span>
                <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-[#525252]"></span>
                <span className="font-mono font-medium text-gray-600 dark:text-gray-400">
                  v{packageJson.version}
                </span>
                <span className="w-1 h-1 rounded-full bg-amber-500 dark:bg-amber-600"></span>
                <span className="font-normal">
                  {t("sidebar.developmentVersion")}
                </span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Layout;

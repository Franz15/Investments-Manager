import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { UserProvider, useUser } from "./contexts/UserContext";
import { TranslationProvider } from "./contexts/TranslationContext";
import { BusinessProvider } from "./contexts/BusinessContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Transactions from "./pages/Transactions";
import Investments from "./pages/Investments";
import Debts from "./pages/Debts";
import Budgets from "./pages/Budgets";
import Forecasts from "./pages/Forecasts";
import Businesses from "./pages/Businesses";
import Profile from "./pages/Profile";
import PortfolioBuilder from "./pages/PortfolioBuilder";
import AdminAccess from "./pages/AdminAccess";
import Budgets from "./pages/Budgets";
import Forecasts from "./pages/Forecasts";
import Businesses from "./pages/Businesses";

const ProtectedRoute = ({ children }) => {
  const { currentUser } = useUser();
  return currentUser ? children : <Navigate to="/login" replace />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/accounts"
        element={
          <ProtectedRoute>
            <Layout>
              <Accounts />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions"
        element={
          <ProtectedRoute>
            <Layout>
              <Transactions />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/investments"
        element={
          <ProtectedRoute>
            <Layout>
              <Investments />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/debts"
        element={
          <ProtectedRoute>
            <Layout>
              <Debts />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/portfolio-builder"
        element={
          <ProtectedRoute>
            <Layout>
              <PortfolioBuilder />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/budgets"
        element={
          <ProtectedRoute>
            <Layout>
              <Budgets />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/forecasts"
        element={
          <ProtectedRoute>
            <Layout>
              <Forecasts />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/businesses"
        element={
          <ProtectedRoute>
            <Layout>
              <Businesses />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/access"
        element={
          <ProtectedRoute>
            <Layout>
              <AdminAccess />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Layout>
              <Profile />
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <TranslationProvider>
      <ThemeProvider>
        <UserProvider>
          <BusinessProvider>
            <Router>
              <AppRoutes />
            </Router>
          </BusinessProvider>
        </UserProvider>
      </ThemeProvider>
    </TranslationProvider>
  );
}

export default App;

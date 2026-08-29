import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Stocks from './pages/Stocks';
import StockDetail from './pages/StockDetail';
import Portfolio from './pages/Portfolio';
import Orders from './pages/Orders';
import Leaderboard from './pages/Leaderboard';
import News from './pages/News';
import IPO from './pages/IPO';
import AdminDashboard from './pages/AdminDashboard';
import Login from './pages/Login';
import Watchlists from './pages/Watchlists';
import Register from './pages/Register';
import TVLeaderboard from './pages/TVLeaderboard';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/tv" element={<TVLeaderboard />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="stocks" element={<Stocks />} />
              <Route path="stocks/:ticker" element={<StockDetail />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="orders" element={<Orders />} />
              <Route path="leaderboard" element={<Leaderboard />} />
              <Route path="news" element={<News />} />
              <Route path="ipo" element={<IPO />} />
              <Route path="watchlists" element={<Watchlists />} />
            </Route>
          </Route>

          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
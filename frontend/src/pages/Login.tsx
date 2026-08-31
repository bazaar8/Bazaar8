import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";
import { ShieldAlert, ArrowRight, Lock, Mail, Zap, BarChart2, Sun, Moon } from "lucide-react";
import logoUrl from '../assets/logo.png';

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, profile, loading, loginUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !loading) {
      if (profile?.isFrozen) {
        setError("Your account has been suspended by the administrator.");
        setIsSubmitting(false);
      } else if (profile?.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/");
      }
    }
  }, [user, profile, loading, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await loginUser(email, password);
    } catch (err: any) {
      setIsSubmitting(false);
      if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        setError("Invalid email address or password.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError("An error occurred during sign in. Check console for details.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-root)] text-[var(--text-main)] flex transition-colors duration-200 relative overflow-hidden">

      <button 
        onClick={toggleTheme} 
        className="absolute top-6 right-6 z-50 p-3 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-full text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors shadow-lg"
      >
        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] left-[10%] w-[600px] h-[600px] bg-[var(--up-color)]/20 rounded-full blur-[140px]" />
        <div className="absolute bottom-[5%] right-[15%] w-[550px] h-[550px] bg-[var(--down-color)]/15 rounded-full blur-[140px]" />
      </div>

      <div className="hidden lg:flex w-1/2 bg-[var(--bg-card)]/70 backdrop-blur-2xl border-r border-[var(--border-subtle)] p-12 flex-col justify-between relative z-10">
        <div>
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Bulls and Bears Logo" className="w-14 h-14 object-contain" />
            <span className="text-3xl font-extrabold tracking-wider text-[var(--text-main)]">Bazaar 8.0</span>
          </div>

          <h1 className="text-5xl xl:text-6xl font-extrabold text-[var(--text-main)] mt-24 leading-[1.15] tracking-tight">
            The next generation<br />
            <span className="bg-gradient-to-r from-[var(--up-color)] to-[var(--down-color)] bg-clip-text text-transparent">
              virtual trading floor.
            </span>
          </h1>
          <p className="text-[var(--text-muted)] mt-6 text-lg max-w-lg leading-relaxed">
            Execute high-frequency trades, monitor live NSE movements, and compete on the institutional leaderboard.
          </p>
        </div>

        <div>
          <div className="flex items-end gap-3 h-36 border-b border-[var(--border-subtle)] pb-1">
            {[35, 65, 45, 95, 60, 100, 80, 50, 85].map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-[var(--up-color)]/20 to-[var(--up-color)] rounded-t-md shadow-[0_0_15px_rgba(126,161,150,0.25)] transition-all duration-500 hover:opacity-100"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="flex items-center justify-between mt-6 text-[var(--text-muted)] text-sm font-mono">
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--up-color)]" /> Live Market Engine Active
            </span>
            <span className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-[var(--up-color)]" /> IST Sync
            </span>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative z-10">
        <div className="max-w-md w-full">
          <div className="text-center lg:text-left mb-8">
            <h2 className="text-3xl font-bold text-[var(--text-main)] tracking-tight mb-2">Welcome Back</h2>
            <p className="text-[var(--text-muted)] text-sm">Enter your credentials to access the terminal.</p>
          </div>

          <div className="bg-[var(--bg-card)]/80 backdrop-blur-2xl border border-[var(--border-subtle)] rounded-3xl p-8 shadow-2xl">
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-[var(--down-color)]/10 border border-[var(--down-color)]/30 flex items-start gap-3 text-[var(--down-color)] text-sm font-medium">
                <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2.5">
                  Account Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[var(--text-muted)]">
                    <Mail className="w-5 h-5" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@college.edu"
                    className="w-full pl-12 pr-4 py-3.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] placeholder-[var(--text-muted)]/50 focus:outline-none focus:border-[var(--up-color)] focus:ring-1 focus:ring-[var(--up-color)] transition text-sm font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2.5">
                  Secure Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[var(--text-muted)]">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-12 pr-4 py-3.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] placeholder-[var(--text-muted)]/50 focus:outline-none focus:border-[var(--up-color)] focus:ring-1 focus:ring-[var(--up-color)] transition text-sm font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || loading}
                className="w-full mt-2 py-4 px-4 bg-[var(--up-color)] hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed text-[#111827] font-bold rounded-xl transition duration-200 flex items-center justify-center gap-2 text-base shadow-[0_0_25px_rgba(126,161,150,0.35)] cursor-pointer"
              >
                {isSubmitting || loading ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-[#111827] border-t-transparent rounded-full animate-spin" />
                    <span>Authenticating...</span>
                  </div>
                ) : (
                  <>
                    <span>Enter Trading Floor</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
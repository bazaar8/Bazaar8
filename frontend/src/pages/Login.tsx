import { useState, FormEvent, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ShieldAlert, ArrowRight, Lock, Mail, TrendingUp, Activity, BarChart2 } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, profile, loading, loginUser } = useAuth();
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
    <div className="min-h-screen bg-gray-950 flex">
      <div className="hidden lg:flex w-1/2 bg-gray-900 border-r border-gray-800 p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[20%] left-[20%] w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] bg-sky-500/10 rounded-full blur-[100px]"></div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-10 h-10 text-emerald-400" />
            <span className="text-3xl font-extrabold text-white tracking-wider">MarketSim</span>
          </div>
          
          <h1 className="text-6xl font-extrabold text-white mt-32 leading-[1.15] tracking-tight">
            The next generation<br/>
            <span className="text-emerald-400">virtual trading floor.</span>
          </h1>
          <p className="text-gray-400 mt-6 text-xl max-w-lg leading-relaxed">
            Execute high-frequency trades, monitor live NSE movements, and compete on the institutional leaderboard.
          </p>
        </div>

        <div className="relative z-10">
          <div className="flex items-end gap-4 h-40 opacity-80 border-b border-gray-800 pb-1">
            {[40, 70, 45, 90, 65, 100, 85].map((h, i) => (
              <div 
                key={i} 
                className="flex-1 bg-gradient-to-t from-emerald-500/20 to-emerald-400/80 rounded-t-md shadow-[0_0_15px_rgba(16,185,129,0.2)]" 
                style={{ height: `${h}%` }}
              ></div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-6 text-gray-500 text-sm font-mono">
            <span className="flex items-center gap-2"><Activity className="w-4 h-4" /> Live Market Engine Active</span>
            <span className="flex items-center gap-2"><BarChart2 className="w-4 h-4" /> IST Sync</span>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative">
        <div className="max-w-md w-full">
          <div className="text-center lg:text-left mb-10">
            <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Welcome Back</h2>
            <p className="text-gray-400">Enter your credentials to access the terminal.</p>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-8 shadow-2xl">
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-rose-400 text-sm">
                <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">
                  Account Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                    <Mail className="w-5 h-5" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@college.edu"
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-950/80 border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition text-base"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">
                  Secure Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-950/80 border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition text-base"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || loading}
                className="w-full mt-4 py-4 px-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-bold rounded-xl transition duration-200 flex items-center justify-center gap-2 text-base shadow-[0_0_20px_rgba(16,185,129,0.3)]"
              >
                {isSubmitting || loading ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-gray-950 border-t-transparent rounded-full animate-spin" />
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
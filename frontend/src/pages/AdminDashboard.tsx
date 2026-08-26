import { useState, useEffect } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getDatabase, ref, onValue } from "firebase/database";
import { getFirestore, collection, onSnapshot, query, orderBy, limit, addDoc, doc, updateDoc, increment } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { app, auth } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme"; 
import { 
  LayoutDashboard, Activity, Users, Newspaper, 
  Sparkles, Power, Pause, Play, ShieldAlert, LogOut,
  Plus, Send, CheckCircle, Upload, X, Clock, TrendingUp, Mail, BarChart2, Sun, Moon
} from "lucide-react";
import { importNewsEvents, releaseEventNow, cancelEvent } from "../services/newsAdminService";
import { processIPOAllotment, listIPO } from "../services/ipoService";

type Tab = 'dashboard' | 'market' | 'participants' | 'stocks' | 'logs' | 'news' | 'ipo';

export default function AdminDashboard() {
  const { logoutUser, profile } = useAuth();
  const { isDark, toggleTheme } = useTheme(); 
  
  // ALL REACT HOOKS MUST BE AT THE TOP LEVEL
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [forceTicker, setForceTicker] = useState("");
  const [forcePrice, setForcePrice] = useState("");
  
  const [csvType, setCsvType] = useState<"news" | "users" | "stocks" | null>(null);
  const [csvText, setCsvText] = useState("");
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [eventDuration, setEventDuration] = useState(15);

  const [ipoName, setIpoName] = useState("");
  const [ipoTicker, setIpoTicker] = useState("");
  const [ipoPrice, setIpoPrice] = useState("");
  const [ipoShares, setIpoShares] = useState("");
  const [ipoOpenTime, setIpoOpenTime] = useState("");
  const [ipoCloseTime, setIpoCloseTime] = useState("");
  const [ipoListTime, setIpoListTime] = useState("");
  const [ipoPremium, setIpoPremium] = useState(""); 
  
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  const [users, setUsers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [ipos, setIpos] = useState<any[]>([]);
  const [adminEvents, setAdminEvents] = useState<any[]>([]);
  const [marketState, setMarketState] = useState("LOADING");
  const [prices, setPrices] = useState<Record<string, any>>({});
  
  // NEW LOGS STATE PROPERLY PLACED
  const [adminLogs, setAdminLogs] = useState<any[]>([]);
  
  const functions = getFunctions(app);
  const rtdb = getDatabase(app);
  const db = getFirestore(app);

  useEffect(() => {
    if (profile?.role !== "admin") return;

    const mktRef = ref(rtdb, "marketStatus/state");
    const unsubMkt = onValue(mktRef, (snap) => setMarketState(snap.val() || "CLOSED"));

    const pricesRef = ref(rtdb, "livePrices");
    const unsubPrices = onValue(pricesRef, (snap) => setPrices(snap.val() || {}));

    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    });

    const unsubOrders = onSnapshot(query(collection(db, "orders"), orderBy("timestamp", "desc"), limit(50)), (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubIpos = onSnapshot(collection(db, "ipos"), (snap) => {
      setIpos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubNews = onSnapshot(query(collection(db, "newsEvents"), orderBy("createdAt", "desc")), (snap) => {
      setAdminEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // LISTENER FOR ADMIN LOGS
    const unsubAdminLogs = onSnapshot(query(collection(db, "adminLogs"), orderBy("timestamp", "desc"), limit(100)), (snap) => {
      setAdminLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubMkt();
      unsubPrices();
      unsubUsers();
      unsubOrders();
      unsubIpos();
      unsubNews();
      unsubAdminLogs();
    };
  }, [profile]);

  // HELPER TO RECORD AUDIT LOGS
  const logAdminAction = async (action: string, details: any) => {
    try {
      await addDoc(collection(db, "adminLogs"), {
        timestamp: Date.now(),
        adminEmail: profile?.name || 'admin',
        action,
        details
      });
    } catch (e) { console.error("Failed to write admin log", e); }
  };

  const handleMarketStatus = async (status: string) => {
    setProcessingAction(`market-${status}`);
    logAdminAction("SET_MARKET_STATE", { state: status });
    try {
      const fn = httpsCallable(functions, 'adminSetMarketStatus');
      await fn({ status });
    } catch (err: any) { alert("Error: " + err.message); } 
    finally { setProcessingAction(null); }
  };

  const handleForcePrice = async () => {
    if (forceTicker && forcePrice) {
      setProcessingAction('force-price');
      logAdminAction("FORCE_PRICE", { ticker: forceTicker, newPrice: forcePrice });
      try {
        const fn = httpsCallable(functions, 'adminForceStockPrice');
        await fn({ ticker: forceTicker.toUpperCase(), price: parseFloat(forcePrice) });
        setForceTicker(""); setForcePrice("");
      } catch (err: any) { alert("Error: " + err.message); } 
      finally { setProcessingAction(null); }
    }
  };

  const handleToggleFreeze = async (uid: string, isFrozen: boolean) => {
    setProcessingAction(`freeze-${uid}`);
    logAdminAction("TOGGLE_FREEZE", { targetUserId: uid, isFrozen });
    try {
      const fn = httpsCallable(functions, 'adminToggleUserFreeze');
      await fn({ uid, isFrozen });
    } catch (err: any) { alert("Error: " + err.message); } 
    finally { setProcessingAction(null); }
  };

  const handleAdjustCash = async (uid: string, currentCash: number) => {
    const amountStr = window.prompt(`Set new cash balance (Current: ₹${currentCash.toLocaleString()}).\nEnter the exact new total:`, currentCash.toString());
    if (amountStr === null) return;
    
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount < 0) {
      alert("Please enter a valid positive number.");
      return;
    }
    
    if (window.confirm(`Are you sure you want to SET this user's cash to exactly ₹${amount.toLocaleString()}?`)) {
      setProcessingAction(`cash-${uid}`);
      logAdminAction("ADJUST_USER_BALANCE", { targetUserId: uid, newBalance: amount, reason: "Admin manual reset" });
      try {
        await updateDoc(doc(db, "users", uid), {
          cashBalance: amount
        });
      } catch (err: any) {
        alert("Error adjusting cash: " + err.message);
      } finally {
        setProcessingAction(null);
      }
    }
  };

  const handleResetSystem = async () => {
    if (!window.confirm("WARNING: This will wipe all orders, holdings, IPOs, news, and reset all user cash. This cannot be undone.\n\nPress OK to proceed.")) return;
    if (window.prompt("Type RESET to confirm complete system wipe:") !== "RESET") { alert("Factory reset cancelled."); return; }
    
    setProcessingAction("reset");
    logAdminAction("FACTORY_RESET", { target: "ENTIRE_SYSTEM" });
    try {
      const fn = httpsCallable(functions, 'adminResetSystem');
      await fn();
      alert("System has been completely reset.");
    } catch (err: any) { alert("Error resetting system: " + err.message); } 
    finally { setProcessingAction(null); }
  };

  const handleDeleteStock = async (ticker: string) => {
    if (window.confirm(`WARNING: Completely remove ${ticker} from the exchange?`)) {
      setProcessingAction(`delete-${ticker}`);
      logAdminAction("DELETE_STOCK", { ticker });
      try {
        await httpsCallable(functions, 'adminDeleteStock')({ ticker });
      } catch (err: any) { alert("Error deleting stock: " + err.message); }
      finally { setProcessingAction(null); }
    }
  };

  const handleEditStock = async (ticker: string, currentData: any) => {
    const newBase = window.prompt(`Modify Base Price for ${ticker}:`, currentData.basePrice || currentData.price);
    if (newBase === null) return;
    const newVol = window.prompt(`Modify Volatility for ${ticker} (default 0.005):`, currentData.volatility);
    if (newVol === null) return;
    
    setProcessingAction(`edit-${ticker}`);
    logAdminAction("EDIT_STOCK", { ticker, newBase, newVol });
    try {
      await httpsCallable(functions, 'adminUpdateStock')({ 
        ticker, basePrice: newBase, volatility: newVol, name: currentData.name || ticker, sector: currentData.sector || "General"
      });
    } catch (err: any) { alert("Error updating stock: " + err.message); }
    finally { setProcessingAction(null); }
  };

  const handleSendPasswordResets = async () => {
    if (!window.confirm(`Send password reset emails to all students?`)) return;
    setProcessingAction("emails");
    logAdminAction("BULK_PASSWORD_RESET", { target: "ALL_STUDENTS" });
    let count = 0;
    for (const u of users) {
      if (u.role !== 'admin') {
        try { await sendPasswordResetEmail(auth, u.email); count++; } catch(e) {}
      }
    }
    setProcessingAction(null);
    alert(`Sent ${count} password reset emails successfully!`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target?.result as string);
      setCsvErrors([]); setParsedData([]);
    };
    reader.readAsText(file);
  };

  const clearCSV = () => { setCsvText(""); setParsedData([]); setCsvErrors([]); };

  const parseCSV = (type: "news" | "users" | "stocks") => {
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return setCsvErrors(["CSV must contain a header row and at least one data row."]);
    
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    const errors: string[] = [];
    const results: any[] = [];

    if (type === "news" && headers[0] !== "headline") errors.push("Column 1 must be 'Headline'.");
    if (type === "users" && (!headers.includes("email") || !headers.includes("password"))) errors.push("Missing 'Email' or 'Password' headers.");
    if (type === "stocks" && (!headers.includes("ticker") || !headers.includes("baseprice"))) errors.push("Missing 'Ticker' or 'BasePrice' headers.");

    if (errors.length > 0) return setCsvErrors(errors);

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length !== headers.length) { errors.push(`Row ${i + 1} has mismatched columns.`); continue; }
      if (!cols[0]) { errors.push(`Row ${i + 1} is missing a headline.`); continue; }

      if (type === "news") {
        const impacts: Record<string, number> = {};
        for (let j = 1; j < cols.length; j++) impacts[headers[j].toUpperCase()] = parseFloat(cols[j]) || 0;
        results.push({ headline: cols[0], stockImpacts: impacts, durationMinutes: eventDuration });
      } else if (type === "users") {
        results.push({ email: cols[0], password: cols[1], name: cols[2] || "Trader", startingBalance: cols[3] || 1000000 });
      } else if (type === "stocks") {
        results.push({ ticker: cols[0].toUpperCase(), name: cols[1], sector: cols[2] || "General", basePrice: parseFloat(cols[3]), volatility: parseFloat(cols[4]) || 0.005 });
      }
    }
    setCsvErrors([]); setParsedData(results); setCsvType(type);
  };

  const handleImportData = async () => {
    if (parsedData.length === 0) return;
    setProcessingAction("import");
    logAdminAction("IMPORT_CSV", { type: csvType, recordCount: parsedData.length });
    try {
      if (csvType === "news") await importNewsEvents(parsedData);
      else if (csvType === "users") await httpsCallable(functions, 'adminImportUsers')({ users: parsedData });
      else if (csvType === "stocks") await httpsCallable(functions, 'adminImportStocks')({ stocks: parsedData });
      
      setParsedData([]); setCsvText(""); alert(`Successfully imported ${parsedData.length} records!`);
    } catch (err: any) { alert("Import Failed: " + err.message); } 
    finally { setProcessingAction(null); }
  };

  const handleFireNews = async (event: any) => {
    if (!window.confirm(`Fire event: "${event.headline}" over ${eventDuration} minutes?`)) return;
    setProcessingAction(`fire-${event.id}`);
    logAdminAction("FIRE_NEWS", { eventId: event.id, headline: event.headline });
    try { await releaseEventNow(event.id, event, eventDuration); } catch (err: any) { alert("Error firing news: " + err.message); } finally { setProcessingAction(null); }
  };

  const handleCancelNews = async (eventId: string) => {
    setProcessingAction(`cancel-${eventId}`);
    logAdminAction("CANCEL_NEWS", { eventId });
    try { await cancelEvent(eventId); } catch (err: any) { alert("Error cancelling news: " + err.message); } finally { setProcessingAction(null); }
  };

  const handleCreateIPO = async () => {
    if (!ipoName || !ipoTicker || !ipoPrice || !ipoShares) return;
    setProcessingAction('create-ipo');
    logAdminAction("CREATE_IPO", { symbol: ipoTicker.toUpperCase(), companyName: ipoName });
    try {
      const startOpen = ipoOpenTime ? new Date(ipoOpenTime).getTime() : Date.now();
      const currentStatus = startOpen > Date.now() ? "upcoming" : "open";
      await addDoc(collection(db, "ipos"), {
        name: ipoName, ticker: ipoTicker.toUpperCase(), price: parseFloat(ipoPrice), totalShares: parseInt(ipoShares),
        listingPremiumPct: parseFloat(ipoPremium) || 0, sector: "Upcoming", allotmentType: "pro-rata", status: currentStatus,
        openTime: startOpen, closeTime: ipoCloseTime ? new Date(ipoCloseTime).getTime() : Date.now() + 3600000,
        listTime: ipoListTime ? new Date(ipoListTime).getTime() : Date.now() + 7200000
      });
      setIpoName(""); setIpoTicker(""); setIpoPrice(""); setIpoShares(""); setIpoOpenTime(""); setIpoCloseTime(""); setIpoListTime(""); setIpoPremium("");
      alert("IPO Scheduled & Initialized!");
    } catch (err: any) { alert("Error creating IPO: " + err.message); } finally { setProcessingAction(null); }
  };

  const handleIPOAction = async (ipoId: string, action: 'close' | 'allot' | 'list') => {
    setProcessingAction(`${ipoId}-${action}`);
    logAdminAction(action === 'allot' ? "RUN_IPO_ALLOTMENT" : action === 'list' ? "LIST_IPO" : "CLOSE_IPO", { ipoSymbol: ipoId });
    try {
      if (action === 'close') await updateDoc(doc(db, "ipos", ipoId), { status: "closed" });
      else if (action === 'allot') await processIPOAllotment(ipoId);
      else await listIPO(ipoId);
    } catch (err: any) { alert(`Error during ${action}: ` + err.message); } finally { setProcessingAction(null); }
  };

  const navItems = [
    { id: 'dashboard', label: 'SYSTEM', icon: LayoutDashboard },
    { id: 'market', label: 'MARKET', icon: Activity },
    { id: 'participants', label: 'TRADERS', icon: Users },
    { id: 'stocks', label: 'STOCKS', icon: BarChart2 },
    { id: 'logs', label: 'ACTIVITY LOGS', icon: ShieldAlert },
    { id: 'news', label: 'NEWS WIRE', icon: Newspaper },
    { id: 'ipo', label: 'PRIMARY MKT', icon: Sparkles },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-root)] text-[var(--text-main)] flex flex-col md:flex-row font-sans transition-colors duration-200">
      <div className="w-full md:w-[220px] bg-[var(--bg-card)] border-r border-[var(--border-subtle)] flex flex-col sticky top-0 h-screen z-50 transition-colors duration-200">
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <span className="text-amber-500 font-bold tracking-tight text-lg">Admin_Sys</span>
          </div>
          <span className="text-[9px] text-[var(--text-muted)] font-mono tracking-widest block mt-1 uppercase">
            MarketSim v2.1
          </span>
        </div>
        
        <nav className="flex-1 overflow-y-auto flex flex-col py-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as Tab)}
                className={`flex items-center gap-2.5 px-5 py-2.5 text-[10px] font-bold tracking-widest uppercase transition-colors text-left ${
                  isActive ? 'bg-[var(--bg-root)] text-[var(--up-color)] border-l-2 border-[var(--up-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-root)] border-l-2 border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="p-3 border-t border-[var(--border-subtle)]">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-2.5 px-4 py-2 mb-2 text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-root)] transition-colors rounded text-left"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>

          <button
            onClick={() => logoutUser()}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-[10px] font-bold tracking-widest uppercase text-[var(--down-color)] hover:bg-[var(--bg-root)] transition-colors rounded text-left"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-x-hidden min-w-0">
        <div className="max-w-6xl mx-auto space-y-6">
          
          {activeTab === 'dashboard' && (
            <div className="space-y-4">
              <div className="border-b border-[var(--border-subtle)] pb-3">
                <h1 className="text-sm font-bold uppercase tracking-widest text-[var(--text-main)]">System Overview</h1>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="terminal-card p-4">
                  <div className="text-[var(--text-muted)] text-[10px] font-bold uppercase mb-1">Engine Status</div>
                  <div className={`text-xl font-bold font-mono ${marketState === 'OPEN' ? 'text-[var(--up-color)]' : 'text-[var(--down-color)]'}`}>
                    {marketState}
                  </div>
                </div>
                <div className="terminal-card p-4">
                  <div className="text-[var(--text-muted)] text-[10px] font-bold uppercase mb-1">Active Traders</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-main)]">{users.length}</div>
                </div>
                <div className="terminal-card p-4">
                  <div className="text-[var(--text-muted)] text-[10px] font-bold uppercase mb-1">Total Executions</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-main)]">{orders.length}</div>
                </div>
                <div className="terminal-card p-4">
                  <div className="text-[var(--text-muted)] text-[10px] font-bold uppercase mb-1">Active Tickers</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-main)]">{Object.keys(prices).length}</div>
                </div>
              </div>

              <div className="mt-8 border-b border-[var(--border-subtle)] pb-3 pt-6">
                <h1 className="text-sm font-bold uppercase tracking-widest text-[var(--down-color)]">Danger Zone</h1>
              </div>
              <div className="bg-[#f2364515] border border-[var(--down-color)] p-6 rounded flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-[var(--down-color)]">Factory Reset System</h2>
                  <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xl">This will permanently wipe all users, orders, holdings, IPOs, active news, and reset all trader accounts back to their starting capital.</p>
                </div>
                <button 
                  onClick={handleResetSystem}
                  disabled={processingAction === 'reset'}
                  className="px-4 py-2 bg-[var(--down-color)] hover:opacity-90 disabled:opacity-50 text-white text-[11px] font-bold uppercase rounded flex items-center gap-2 transition-opacity whitespace-nowrap"
                >
                  {processingAction === 'reset' ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                  INITIATE FACTORY RESET
                </button>
              </div>
            </div>
          )}

          {activeTab === 'market' && (
            <div className="space-y-4">
              <div className="border-b border-[var(--border-subtle)] pb-3">
                <h1 className="text-sm font-bold uppercase tracking-widest text-[var(--text-main)]">Market Controls</h1>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="terminal-card p-6 space-y-4">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-main)] border-b border-[var(--border-subtle)] pb-2">Master Switch</h2>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleMarketStatus('OPEN')} 
                      disabled={processingAction === 'market-OPEN'}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-[#08998115] border border-[var(--up-color)] text-[var(--up-color)] text-[11px] font-bold uppercase rounded hover:opacity-80 disabled:opacity-50"
                    >
                      {processingAction === 'market-OPEN' ? <div className="w-3.5 h-3.5 border-2 border-[var(--up-color)] border-t-transparent rounded-full animate-spin" /> : <Play className="w-3.5 h-3.5" />} Open
                    </button>
                    <button 
                      onClick={() => handleMarketStatus('PAUSED')} 
                      disabled={processingAction === 'market-PAUSED'}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-[#f59e0b15] border border-[#f59e0b] text-[#f59e0b] text-[11px] font-bold uppercase rounded hover:opacity-80 disabled:opacity-50"
                    >
                      {processingAction === 'market-PAUSED' ? <div className="w-3.5 h-3.5 border-2 border-[#f59e0b] border-t-transparent rounded-full animate-spin" /> : <Pause className="w-3.5 h-3.5" />} Pause
                    </button>
                    <button 
                      onClick={() => handleMarketStatus('CLOSED')} 
                      disabled={processingAction === 'market-CLOSED'}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-[#f2364515] border border-[var(--down-color)] text-[var(--down-color)] text-[11px] font-bold uppercase rounded hover:opacity-80 disabled:opacity-50"
                    >
                      {processingAction === 'market-CLOSED' ? <div className="w-3.5 h-3.5 border-2 border-[var(--down-color)] border-t-transparent rounded-full animate-spin" /> : <Power className="w-3.5 h-3.5" />} Close
                    </button>
                  </div>
                </div>
                <div className="terminal-card p-6 space-y-4">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--down-color)] border-b border-[var(--border-subtle)] pb-2 flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5" /> Force Price Overwrite
                  </h2>
                  <div className="flex gap-2">
                    <input type="text" placeholder="TICKER" value={forceTicker} onChange={e => setForceTicker(e.target.value)} className="w-1/3 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-xs uppercase rounded focus:outline-none focus:border-[var(--up-color)]" />
                    <input type="number" placeholder="Price" value={forcePrice} onChange={e => setForcePrice(e.target.value)} className="w-1/3 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-xs rounded focus:outline-none focus:border-[var(--up-color)]" />
                    <button 
                      onClick={handleForcePrice} 
                      disabled={processingAction === 'force-price'} 
                      className="flex-1 bg-[var(--down-color)] text-white text-[11px] font-bold uppercase rounded hover:opacity-90 disabled:opacity-50 flex items-center justify-center"
                    >
                      {processingAction === 'force-price' ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Execute"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'participants' && (
            <div className="space-y-6">
              <div className="border-b border-[var(--border-subtle)] pb-3 flex justify-between items-center">
                <h1 className="text-sm font-bold uppercase tracking-widest text-[var(--text-main)]">Traders Management</h1>
                <button 
                  onClick={handleSendPasswordResets} 
                  disabled={processingAction === 'emails'}
                  className="px-4 py-2 bg-[#3b82f6] hover:opacity-90 disabled:opacity-50 text-white text-[11px] font-bold uppercase rounded flex items-center gap-2 transition-opacity"
                >
                  {processingAction === 'emails' ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Send Reset Emails to All
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="terminal-card p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-main)]">Bulk Import CSV</h2>
                    {csvText && (
                      <button onClick={clearCSV} className="text-[var(--down-color)] hover:opacity-80">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono bg-[var(--bg-root)] p-2 rounded">
                    Format: Email,Password,Name,StartingBalance
                  </div>
    
                  {!csvText ? (
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-[var(--border-subtle)] border-dashed rounded cursor-pointer bg-[var(--bg-root)] hover:opacity-80 transition-colors">
                      <Upload className="w-5 h-5 mb-1 text-[var(--text-muted)]" />
                      <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Click to upload CSV file</p>
                      <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                    </label>
                  ) : (
                    <textarea 
                      value={csvText} 
                      onChange={e => setCsvText(e.target.value)} 
                      className="w-full h-24 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs font-mono rounded focus:outline-none focus:border-[var(--up-color)]" 
                    />
                  )}

                  <button onClick={() => parseCSV("users")} className="w-full py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-[var(--text-main)] text-[11px] font-bold uppercase rounded transition-colors">Validate Users CSV</button>
                  {csvErrors.length > 0 && csvType === "users" && (
                    <div className="p-3 bg-[#f2364515] border border-[var(--down-color)] rounded mt-2">
                      <ul className="list-disc pl-4 text-[10px] text-[var(--down-color)]">
                        {csvErrors.map((err, i) => <li key={i}>{err}</li>)}
                      </ul>
                    </div>
                  )}
                  {parsedData.length > 0 && csvType === "users" && (
                    <button 
                      onClick={handleImportData} 
                      disabled={processingAction === 'import'}
                      className="w-full py-2 bg-[var(--up-color)] hover:opacity-90 disabled:opacity-50 text-white text-[11px] font-bold uppercase rounded mt-2 flex items-center justify-center gap-2 transition-opacity"
                    >
                      {processingAction === 'import' ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                      Import {parsedData.length} Users
                    </button>
                  )}
                </div>
              </div>

              <div className="terminal-card overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[var(--bg-root)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Email</th>
                      <th className="p-3">Role</th>
                      <th className="p-3 text-right">Cash</th>
                      <th className="p-3 text-right">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {users.map(u => (
                      <tr key={u.uid} className="hover:bg-[var(--bg-root)] transition-colors">
                        <td className="p-3 text-[var(--text-main)]">{u.email}</td>
                        <td className="p-3 text-[var(--text-muted)]">{u.role}</td>
                        <td className="p-3 text-right text-[var(--text-main)]">₹{Number(u.cashBalance || 0).toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <span className={`px-2 py-1 rounded text-[9px] font-bold ${u.isFrozen ? 'bg-[#f2364515] text-[var(--down-color)]' : 'bg-[#08998115] text-[var(--up-color)]'}`}>
                            {u.isFrozen ? 'FROZEN' : 'ACTIVE'}
                          </span>
                        </td>
                        <td className="p-3 flex justify-end gap-2">
                          <button 
                            onClick={() => handleAdjustCash(u.uid, u.cashBalance || 0)} 
                            disabled={processingAction === `cash-${u.uid}`}
                            className="px-2 py-1 bg-[var(--bg-root)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] rounded text-[10px] font-bold flex items-center justify-center w-24 transition-colors"
                          >
                            {processingAction === `cash-${u.uid}` ? <div className="w-3 h-3 border-2 border-[var(--text-main)] border-t-transparent rounded-full animate-spin" /> : 'ADJUST CASH'}
                          </button>
                          <button 
                            onClick={() => handleToggleFreeze(u.uid, !u.isFrozen)} 
                            disabled={processingAction === `freeze-${u.uid}`}
                            className={`px-2 py-1 disabled:opacity-50 rounded text-[10px] font-bold flex items-center justify-center w-20 transition-opacity ${u.isFrozen ? 'bg-[var(--text-muted)] text-white hover:opacity-90' : 'bg-[var(--down-color)] text-white hover:opacity-90'}`}
                          >
                            {processingAction === `freeze-${u.uid}` ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : u.isFrozen ? 'UNFREEZE' : 'FREEZE'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'stocks' && (
            <div className="space-y-6">
              <div className="border-b border-[var(--border-subtle)] pb-3">
                <h1 className="text-sm font-bold uppercase tracking-widest text-[var(--text-main)]">Stock Directory Importer</h1>
              </div>

              <div className="terminal-card p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-main)]">Bulk Import CSV</h2>
                  {csvText && (
                    <button onClick={clearCSV} className="text-[var(--down-color)] hover:opacity-80">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] font-mono bg-[var(--bg-root)] p-2 rounded">
                  Format: Ticker,Name,Sector,BasePrice,Volatility<br/>Example: RELIANCE,Reliance Ind,Energy,2950.0,0.002
                </div>

                {!csvText ? (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-[var(--border-subtle)] border-dashed rounded cursor-pointer bg-[var(--bg-root)] hover:opacity-80 transition-colors">
                    <Upload className="w-5 h-5 mb-2 text-[var(--text-muted)]" />
                    <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Click to upload CSV file</p>
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                  </label>
                ) : (
                  <textarea 
                    value={csvText} 
                    onChange={e => setCsvText(e.target.value)} 
                    className="w-full h-32 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs font-mono rounded focus:outline-none focus:border-[var(--up-color)]" 
                  />
                )}

                <button onClick={() => parseCSV("stocks")} className="w-full py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-[var(--text-main)] text-[11px] font-bold uppercase rounded transition-colors">Validate Stocks CSV</button>
                {csvErrors.length > 0 && csvType === "stocks" && (
                  <div className="p-3 bg-[#f2364515] border border-[var(--down-color)] rounded mt-2">
                    <ul className="list-disc pl-4 text-[10px] text-[var(--down-color)]">
                      {csvErrors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  </div>
                )}
                {parsedData.length > 0 && csvType === "stocks" && (
                  <button 
                    onClick={handleImportData} 
                    disabled={processingAction === 'import'}
                    className="w-full py-2 bg-[var(--up-color)] hover:opacity-90 disabled:opacity-50 text-white text-[11px] font-bold uppercase rounded mt-2 flex items-center justify-center gap-2 transition-opacity"
                  >
                    {processingAction === 'import' ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                    Push {parsedData.length} Stocks to Exchange
                  </button>
                )}
              </div>

              <div className="terminal-card overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[var(--bg-root)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Ticker</th>
                      <th className="p-3">Sector</th>
                      <th className="p-3 text-right">Base Price</th>
                      <th className="p-3 text-right">Live Price</th>
                      <th className="p-3 text-right">Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {Object.entries(prices).map(([ticker, data]: [string, any]) => (
                      <tr key={ticker} className="hover:bg-[var(--bg-root)] transition-colors">
                        <td className="p-3 text-[var(--text-main)] font-bold">{ticker}</td>
                        <td className="p-3 text-[var(--text-muted)]">{data.sector || 'General'}</td>
                        <td className="p-3 text-right text-[var(--text-muted)]">{Number(data.basePrice || data.price).toFixed(2)}</td>
                        <td className="p-3 text-right text-[#3b82f6] font-bold">{Number(data.price).toFixed(2)}</td>
                        <td className="p-3 flex justify-end gap-2">
                          <button 
                            onClick={() => handleEditStock(ticker, data)} 
                            disabled={processingAction === `edit-${ticker}`}
                            className="px-2 py-1 bg-[var(--bg-root)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] rounded text-[10px] font-bold flex items-center justify-center w-14 transition-colors"
                          >
                            {processingAction === `edit-${ticker}` ? <div className="w-3 h-3 border-2 border-[var(--text-main)] border-t-transparent rounded-full animate-spin" /> : 'EDIT'}
                          </button>
                          <button 
                            onClick={() => handleDeleteStock(ticker)} 
                            disabled={processingAction === `delete-${ticker}`}
                            className="px-2 py-1 bg-[#f2364515] hover:opacity-80 border border-[var(--down-color)] disabled:opacity-50 text-[var(--down-color)] rounded text-[10px] font-bold flex items-center justify-center w-16 transition-opacity"
                          >
                            {processingAction === `delete-${ticker}` ? <div className="w-3 h-3 border-2 border-[var(--down-color)] border-t-transparent rounded-full animate-spin" /> : 'DELETE'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="border-b border-[var(--border-subtle)] pb-3 flex justify-between items-center">
                <h1 className="text-sm font-bold uppercase tracking-widest text-[var(--text-main)]">System Audit Logs</h1>
                <div className="text-[10px] text-[var(--text-muted)] font-mono bg-[var(--bg-root)] px-2 py-1 rounded border border-[var(--border-subtle)]">Recording Admin Actions</div>
              </div>
              
              <div className="terminal-card overflow-hidden bg-[var(--bg-card)]">
                <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
                  <table className="w-full text-left text-xs font-mono whitespace-nowrap">
                    <thead className="bg-[var(--bg-root)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-[10px] uppercase font-bold tracking-widest sticky top-0">
                      <tr>
                        <th className="p-4 w-48">TIMESTAMP</th>
                        <th className="p-4 w-40">ADMIN USERNAME</th>
                        <th className="p-4 w-48">ACTION</th>
                        <th className="p-4">DETAILS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {adminLogs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-12 text-center text-[var(--text-muted)] font-mono text-xs">NO ADMIN LOGS RECORDED</td>
                        </tr>
                      ) : (
                        adminLogs.map(log => (
                          <tr key={log.id} className="hover:bg-[var(--bg-root)] transition-colors">
                            <td className="p-4 text-[var(--text-muted)]">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="p-4 text-[var(--text-main)] font-bold">
                              {log.adminEmail}
                            </td>
                            <td className="p-4 text-[#3b82f6] font-bold uppercase tracking-wider">
                              {log.action}
                            </td>
                            <td className="p-4 text-[var(--text-muted)] font-mono text-[11px]">
                              {JSON.stringify(log.details)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'news' && (
            <div className="space-y-6">
              <div className="border-b border-[var(--border-subtle)] pb-3">
                <h1 className="text-sm font-bold uppercase tracking-widest text-[var(--text-main)]">News Matrix Importer</h1>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 terminal-card p-5 space-y-4 h-fit">
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-main)]">CSV Upload</h2>
                    {csvText && (
                      <button onClick={clearCSV} className="text-[var(--down-color)] hover:opacity-80">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  <div className="text-[10px] text-[var(--text-muted)] font-mono bg-[var(--bg-root)] p-2 rounded">
                    Format: Headline,TICKER1,TICKER2...<br/>Example: Rate Cut,RELIANCE,TCS
                  </div>

                  {!csvText ? (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-[var(--border-subtle)] border-dashed rounded cursor-pointer bg-[var(--bg-root)] hover:opacity-80 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-6 h-6 mb-2 text-[var(--text-muted)]" />
                        <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Click to upload CSV file</p>
                      </div>
                      <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                    </label>
                  ) : (
                    <textarea 
                      value={csvText} 
                      onChange={e => setCsvText(e.target.value)} 
                      className="w-full h-32 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs font-mono rounded focus:outline-none focus:border-[var(--up-color)]"
                    />
                  )}
                  
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Impact Duration (Mins)</label>
                    <input 
                      type="number" 
                      value={eventDuration} 
                      onChange={e => setEventDuration(parseInt(e.target.value) || 15)} 
                      className="w-16 px-2 py-1 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded focus:outline-none focus:border-[var(--up-color)]"
                    />
                  </div>

                  <button 
                    onClick={() => parseCSV("news")}
                    disabled={!csvText}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] disabled:opacity-50 text-[var(--text-main)] text-[11px] font-bold uppercase rounded transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" /> Validate CSV
                  </button>

                  {csvErrors.length > 0 && (
                    <div className="p-3 bg-[#f2364515] border border-[var(--down-color)] rounded mt-2">
                      <ul className="list-disc pl-4 text-[10px] text-[var(--down-color)]">
                        {csvErrors.map((err, i) => <li key={i}>{err}</li>)}
                      </ul>
                    </div>
                  )}

                  {parsedData.length > 0 && csvType === "news" && (
                    <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
                      <h3 className="text-xs font-bold text-[var(--text-main)] mb-2">Preview ({parsedData.length} Events)</h3>
                      <button 
                        onClick={handleImportData} 
                        disabled={processingAction === 'import'}
                        className="w-full py-2 bg-[var(--up-color)] hover:opacity-90 disabled:opacity-50 text-white text-[11px] font-bold uppercase rounded flex items-center justify-center gap-2 transition-opacity"
                      >
                        {processingAction === 'import' ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                        Import to Database
                      </button>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2 terminal-card overflow-hidden">
                  <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-root)]">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-main)]">Event Queue & Active Events</h2>
                  </div>
                  
                  {adminEvents.length === 0 ? (
                    <div className="p-4 flex flex-col items-center justify-center text-[var(--text-muted)] py-12">
                      <Newspaper className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-xs font-mono">No events imported yet.</p>
                    </div>
                  ) : (
                    <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                      {adminEvents.map(evt => (
                        <div key={evt.id} className="bg-[var(--bg-root)] border border-[var(--border-subtle)] p-4 rounded">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="text-sm font-bold text-[var(--text-main)] leading-tight">{evt.headline}</h3>
                            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded ${
                              evt.status === 'active' ? 'bg-[#3b82f615] text-[#3b82f6] border border-[#3b82f630]' :
                              evt.status === 'draft' ? 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-subtle)]' :
                              evt.status === 'cancelled' ? 'bg-[#f2364515] text-[var(--down-color)] border border-[var(--down-color)]' :
                              'bg-[#08998115] text-[var(--up-color)] border border-[#08998130]'
                            }`}>
                              {evt.status}
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap gap-2 mt-3 text-[10px] font-mono">
                            {Object.entries(evt.stockImpacts || {}).map(([tkr, pct]: any) => (
                              <span key={tkr} className={`px-1.5 py-0.5 rounded border ${pct >= 0 ? 'border-[var(--up-color)] text-[var(--up-color)] bg-[#08998115]' : 'border-[var(--down-color)] text-[var(--down-color)] bg-[#f2364515]'}`}>
                                {tkr}: {pct > 0 ? '+' : ''}{pct}%
                              </span>
                            ))}
                          </div>

                          <div className="flex gap-2 mt-4 pt-3 border-t border-[var(--border-subtle)]">
                            <button 
                              onClick={() => handleFireNews(evt)}
                              disabled={evt.status === 'active' || evt.status === 'completed' || processingAction === `fire-${evt.id}`}
                              className="px-4 py-1.5 bg-[#3b82f6] hover:opacity-90 disabled:opacity-50 text-white text-[10px] font-bold uppercase rounded flex items-center gap-1.5 w-24 justify-center transition-opacity"
                            >
                              {processingAction === `fire-${evt.id}` ? (
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <><Send className="w-3 h-3" /> Fire Now</>
                              )}
                            </button>
                            <button 
                              onClick={() => handleCancelNews(evt.id)}
                              disabled={evt.status === 'cancelled' || processingAction === `cancel-${evt.id}`}
                              className="px-3 py-1.5 bg-[var(--bg-card)] hover:bg-[var(--bg-root)] disabled:opacity-50 text-[var(--text-muted)] border border-[var(--border-subtle)] text-[10px] font-bold uppercase rounded flex items-center justify-center w-20 transition-colors"
                            >
                              {processingAction === `cancel-${evt.id}` ? <div className="w-3 h-3 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" /> : 'Cancel'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ipo' && (
            <div className="space-y-6">
              <div className="border-b border-[var(--border-subtle)] pb-3">
                <h1 className="text-sm font-bold uppercase tracking-widest text-[var(--text-main)]">Primary Market (IPO)</h1>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-1 terminal-card p-5 space-y-4 h-fit">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-main)] border-b border-[var(--border-subtle)] pb-2">Schedule Offering</h2>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Company Name</label>
                        <input type="text" value={ipoName} onChange={(e) => setIpoName(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded focus:outline-none focus:border-[#f59e0b]" placeholder="Quantum AI" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Ticker</label>
                        <input type="text" value={ipoTicker} onChange={(e) => setIpoTicker(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded uppercase focus:outline-none focus:border-[#f59e0b]" placeholder="QAI" />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Issue Price</label>
                        <input type="number" value={ipoPrice} onChange={(e) => setIpoPrice(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded focus:outline-none focus:border-[#f59e0b]" placeholder="₹" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Shares</label>
                        <input type="number" value={ipoShares} onChange={(e) => setIpoShares(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded focus:outline-none focus:border-[#f59e0b]" placeholder="Qty" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase flex items-center gap-1"><TrendingUp className="w-3 h-3 text-[var(--up-color)]"/> Hike %</label>
                        <input type="number" value={ipoPremium} onChange={(e) => setIpoPremium(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded focus:outline-none focus:border-[#f59e0b]" placeholder="+GMP%" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 pt-2 border-t border-[var(--border-subtle)]">
                      <div>
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase flex items-center gap-1"><Clock className="w-3 h-3"/> Market Opens (Buy window)</label>
                        <input type="datetime-local" value={ipoOpenTime} onChange={(e) => setIpoOpenTime(e.target.value)} className="w-full mt-1 px-2 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-[11px] rounded focus:outline-none focus:border-[#f59e0b]" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase flex items-center gap-1"><Clock className="w-3 h-3"/> Market Closes (Allotment begins)</label>
                        <input type="datetime-local" value={ipoCloseTime} onChange={(e) => setIpoCloseTime(e.target.value)} className="w-full mt-1 px-2 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-[11px] rounded focus:outline-none focus:border-[#f59e0b]" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase flex items-center gap-1"><Clock className="w-3 h-3"/> Listing Time (Live trading begins)</label>
                        <input type="datetime-local" value={ipoListTime} onChange={(e) => setIpoListTime(e.target.value)} className="w-full mt-1 px-2 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-[11px] rounded focus:outline-none focus:border-[#f59e0b]" />
                      </div>
                    </div>
                    
                    <button 
                      onClick={handleCreateIPO}
                      disabled={processingAction === 'create-ipo'}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 mt-2 bg-[#f59e0b] hover:opacity-90 disabled:opacity-50 text-white text-[11px] font-bold uppercase rounded transition-opacity"
                    >
                      {processingAction === 'create-ipo' ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      {processingAction === 'create-ipo' ? 'Initializing...' : 'Initialize IPO'}
                    </button>
                  </div>
                </div>

                <div className="xl:col-span-2 terminal-card overflow-x-auto">
                   <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[var(--bg-root)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-[10px] uppercase">
                      <tr>
                        <th className="p-3">Ticker</th>
                        <th className="p-3 text-right">Issue Price</th>
                        <th className="p-3 text-right">Hike (GMP)</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-right">Manual Override</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {ipos.map(ipo => (
                        <tr key={ipo.id} className="hover:bg-[var(--bg-root)] transition-colors">
                          <td className="p-3 text-[var(--text-main)] font-bold">{ipo.ticker}</td>
                          <td className="p-3 text-right text-[var(--text-main)]">₹{ipo.price}</td>
                          <td className="p-3 text-right text-[var(--up-color)]">+{ipo.listingPremiumPct || 0}%</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                              ipo.status === 'upcoming' ? 'bg-[#f59e0b15] text-[#f59e0b]' :
                              ipo.status === 'open' ? 'bg-[#08998115] text-[var(--up-color)] animate-pulse' :
                              ipo.status === 'allotting' ? 'bg-[#8b5cf615] text-[#8b5cf6] animate-pulse' :
                              'bg-[#3b82f615] text-[#3b82f6]'
                            }`}>{ipo.status}</span>
                          </td>
                          <td className="p-3 flex justify-end gap-2">
                            <button 
                              onClick={() => handleIPOAction(ipo.id, 'close')}
                              disabled={ipo.status !== 'open' || processingAction === `${ipo.id}-close`}
                              className="px-2 py-1 flex items-center gap-1 bg-[#f59e0b15] hover:opacity-80 border border-[#f59e0b50] disabled:opacity-50 text-[#f59e0b] rounded text-[9px] font-bold uppercase w-20 justify-center transition-opacity"
                            >
                              {processingAction === `${ipo.id}-close` ? <div className="w-3 h-3 border-2 border-[#f59e0b] border-t-transparent rounded-full animate-spin" /> : <><Pause className="w-3 h-3" /> Close</>}
                            </button>
                            <button 
                              onClick={() => handleIPOAction(ipo.id, 'allot')}
                              disabled={ipo.status !== 'closed' || processingAction === `${ipo.id}-allot`}
                              className="px-2 py-1 flex items-center gap-1 bg-[var(--bg-root)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] disabled:opacity-50 text-[var(--text-main)] rounded text-[9px] font-bold uppercase w-20 justify-center transition-colors"
                            >
                              {processingAction === `${ipo.id}-allot` ? <div className="w-3 h-3 border-2 border-[var(--text-main)] border-t-transparent rounded-full animate-spin" /> : <><CheckCircle className="w-3 h-3" /> Allot</>}
                            </button>
                            <button 
                              onClick={() => handleIPOAction(ipo.id, 'list')}
                              disabled={ipo.status !== 'allotted' || processingAction === `${ipo.id}-list`}
                              className="px-2 py-1 flex items-center gap-1 bg-[#08998115] hover:opacity-80 border border-[#08998150] disabled:opacity-50 text-[var(--up-color)] rounded text-[9px] font-bold uppercase w-20 justify-center transition-opacity"
                            >
                               {processingAction === `${ipo.id}-list` ? <div className="w-3 h-3 border-2 border-[var(--up-color)] border-t-transparent rounded-full animate-spin" /> : <><Activity className="w-3 h-3" /> List</>}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
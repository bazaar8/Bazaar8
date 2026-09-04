import { useState, useEffect } from "react";
import { httpsCallable, API_URL } from "../config/api";
import { socket } from "../config/socket";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme"; 
import { useNotifications } from "../context/NotificationContext";
import { 
  LayoutDashboard, Users, Newspaper, 
  Sparkles, Power, Pause, Play, ShieldAlert, LogOut,
  Plus, Send, CheckCircle, Upload, Download, X, Clock, TrendingUp, Mail, BarChart2, Sun, Moon, Sliders, Coins, Edit, Trash2, Zap, Radio
} from "lucide-react";
import { 
  importNewsEvents, 
  createSingleNewsEvent,
  releaseEventNow, 
  cancelEvent, 
  deleteAllNewsEvents,
  deleteSingleNewsEvent,
  triggerNextNewsEvent,
  triggerAllNewsEvents
} from "../services/newsAdminService";
import { STOCKS_CATALOG } from "../data/stocksData";

type Tab = 'dashboard' | 'market' | 'participants' | 'stocks' | 'logs' | 'news' | 'ipo';

export default function AdminDashboard() {
  const { logoutUser, profile } = useAuth();
  const { isDark, toggleTheme } = useTheme(); 
  const { notify } = useNotifications(); // <-- Initialize Notifications
  
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [forceTicker, setForceTicker] = useState("");
  const [forcePrice, setForcePrice] = useState("");
  
  const [csvType, setCsvType] = useState<"news" | "users" | "stocks" | null>(null);
  const [csvText, setCsvText] = useState("");
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [eventDuration, setEventDuration] = useState(15);
  const [newsInputMode, setNewsInputMode] = useState<"single" | "bulk">("single");
  const [singleHeadline, setSingleHeadline] = useState("");
  const [singleDuration, setSingleDuration] = useState(15);
  const [singleImpacts, setSingleImpacts] = useState<{ [ticker: string]: number }>({});
  const [impactTicker, setImpactTicker] = useState("RELIANCE");
  const [impactValue, setImpactValue] = useState("");

  const [ipoName, setIpoName] = useState("");
  const [ipoTicker, setIpoTicker] = useState("");
  const [ipoSector, setIpoSector] = useState(""); // <-- Added Sector State
  const [ipoPrice, setIpoPrice] = useState("");
  const [ipoLotSize, setIpoLotSize] = useState(""); 
  const [ipoTotalLots, setIpoTotalLots] = useState(""); 
  const [ipoPremium, setIpoPremium] = useState(""); 
  const [ipoOpenTime, setIpoOpenTime] = useState("");
  const [ipoCloseTime, setIpoCloseTime] = useState("");
  const [ipoListTime, setIpoListTime] = useState("");
  
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  const [users, setUsers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [ipos, setIpos] = useState<any[]>([]);
  const [adminEvents, setAdminEvents] = useState<any[]>([]);
  const [marketState, setMarketState] = useState("LOADING");
  const [prices, setPrices] = useState<Record<string, any>>({});
  
  const [adminLogs, setAdminLogs] = useState<any[]>([]);
  const [taxTreasury, setTaxTreasury] = useState<{ totalTaxCollected?: number; lastTradeTax?: number }>({ totalTaxCollected: 0 });

  useEffect(() => {
    if (profile?.role !== "admin") return;

    const fetchAdminData = async () => {
      const token = localStorage.getItem("bazaar_jwt_token");
      const headers = { Authorization: `Bearer ${token}` };

      try {
        const [usersRes, ordersRes, iposRes, newsRes, logsRes, stateRes] = await Promise.all([
          fetch(`${API_URL}/admin/users`, { headers }),
          fetch(`${API_URL}/admin/orders`, { headers }),
          fetch(`${API_URL}/ipos`, { headers }),
          fetch(`${API_URL}/news`, { headers }),
          fetch(`${API_URL}/adminLogs`, { headers }),
          fetch(`${API_URL}/state`, { headers })
        ]);

        if (usersRes.ok) setUsers((await usersRes.json()).data || []);
        if (ordersRes.ok) setOrders((await ordersRes.json()).data || []);
        if (iposRes.ok) setIpos((await iposRes.json()).data || []);
        if (newsRes.ok) setAdminEvents((await newsRes.json()).data || []);
        if (logsRes.ok) setAdminLogs((await logsRes.json()).data || []);
        
        if (stateRes.ok) {
          const stateData = await stateRes.json();
          if (stateData.data) {
            setTaxTreasury({ totalTaxCollected: stateData.data.totalTaxCollected || 0 });
            if (stateData.data.livePrices) setPrices(stateData.data.livePrices);
            if (stateData.data.marketStatus) setMarketState(stateData.data.marketStatus);
          }
        }
      } catch (err) {
        console.error("Failed to fetch admin data", err);
      }
    };

    fetchAdminData();
    const interval = setInterval(fetchAdminData, 5000);

    const handleLivePrices = (data: any) => {
      if (data.prices) setPrices(data.prices);
      if (data.marketStatus) setMarketState(data.marketStatus);
    };

    socket.on("livePrices", handleLivePrices);

    return () => {
      clearInterval(interval);
      socket.off("livePrices", handleLivePrices);
    };
  }, [profile]);

  const logAdminAction = async (action: string, details: any) => {
    try {
      await httpsCallable('logAdminAction')({ action, details });
    } catch (e) { console.error("Failed to write admin log", e); }
  };

  const handleMarketStatus = async (status: string) => {
    setProcessingAction(`market-${status}`);
    logAdminAction("SET_MARKET_STATE", { state: status });
    try {
      await httpsCallable('adminSetMarketStatus')({ status });
      notify({ type: "alert", title: "Market Status", message: `Market is now ${status}`, impact: status === 'OPEN' ? 'positive' : 'negative' });
    } catch (err: any) { notify({ type: "alert", title: "Error", message: err.message, impact: "negative" }); } 
    finally { setProcessingAction(null); }
  };

  const handleForcePrice = async () => {
    if (forceTicker && forcePrice) {
      setProcessingAction('force-price');
      logAdminAction("FORCE_PRICE", { ticker: forceTicker, newPrice: forcePrice });
      try {
        await httpsCallable('adminForceStockPrice')({ ticker: forceTicker.toUpperCase(), price: parseFloat(forcePrice) });
        notify({ type: "alert", title: "Price Updated", message: `${forceTicker.toUpperCase()} forced to ₹${forcePrice}`, impact: "positive" });
        setForceTicker(""); setForcePrice("");
      } catch (err: any) { notify({ type: "alert", title: "Error", message: err.message, impact: "negative" }); } 
      finally { setProcessingAction(null); }
    }
  };

  const handleToggleFreeze = async (uid: string, isFrozen: boolean) => {
    setProcessingAction(`freeze-${uid}`);
    logAdminAction("TOGGLE_FREEZE", { targetUserId: uid, isFrozen });
    try {
      await httpsCallable('adminToggleUserFreeze')({ uid, isFrozen });
      notify({ type: "alert", title: "User Updated", message: `User has been ${isFrozen ? 'frozen' : 'unfrozen'}.`, impact: "neutral" });
    } catch (err: any) { notify({ type: "alert", title: "Error", message: err.message, impact: "negative" }); } 
    finally { setProcessingAction(null); }
  };

  const handleAdjustCash = async (uid: string, currentCash: number) => {
    const amountStr = window.prompt(`Set new cash balance (Current: ₹${currentCash.toLocaleString()}).\nEnter the exact new total:`, currentCash.toString());
    if (amountStr === null) return;
    
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount < 0) {
      notify({ type: "alert", title: "Invalid Input", message: "Please enter a valid positive number.", impact: "negative" });
      return;
    }
    
    if (window.confirm(`Are you sure you want to SET this user's cash to exactly ₹${amount.toLocaleString()}?`)) {
      setProcessingAction(`cash-${uid}`);
      logAdminAction("ADJUST_USER_BALANCE", { targetUserId: uid, newBalance: amount, reason: "Admin manual reset" });
      try {
        await httpsCallable('adminAdjustCash')({ uid, amount });
        notify({ type: "alert", title: "Cash Adjusted", message: `User balance set to ₹${amount.toLocaleString()}`, impact: "positive" });
      } catch (err: any) { notify({ type: "alert", title: "Error", message: err.message, impact: "negative" }); } 
      finally { setProcessingAction(null); }
    }
  };

  const handleResetSystem = async () => {
    if (!window.confirm("WARNING: This will wipe all orders, holdings, IPOs, news, and reset all user cash. This cannot be undone.\n\nPress OK to proceed.")) return;
    if (window.prompt("Type RESET to confirm complete system wipe:") !== "RESET") { 
      notify({ type: "alert", title: "Cancelled", message: "Factory reset cancelled.", impact: "neutral" });
      return; 
    }
    
    setProcessingAction("reset");
    logAdminAction("FACTORY_RESET", { target: "ENTIRE_SYSTEM" });
    try {
      await httpsCallable('adminResetSystem')();
      notify({ type: "alert", title: "System Reset", message: "System has been completely wiped.", impact: "positive" });
    } catch (err: any) { notify({ type: "alert", title: "Error", message: err.message, impact: "negative" }); } 
    finally { setProcessingAction(null); }
  };

  const handleDeleteStock = async (ticker: string) => {
    if (window.confirm(`WARNING: Completely remove ${ticker} from the exchange?`)) {
      setProcessingAction(`delete-${ticker}`);
      logAdminAction("DELETE_STOCK", { ticker });
      try {
        await httpsCallable('adminDeleteStock')({ ticker });
        notify({ type: "alert", title: "Stock Deleted", message: `${ticker} removed from exchange.`, impact: "neutral" });
      } catch (err: any) { notify({ type: "alert", title: "Error", message: err.message, impact: "negative" }); }
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
      await httpsCallable('adminUpdateStock')({ 
        ticker, basePrice: newBase, volatility: newVol, name: currentData.name || ticker, sector: currentData.sector || "General"
      });
      notify({ type: "alert", title: "Stock Updated", message: `${ticker} parameters updated.`, impact: "positive" });
    } catch (err: any) { notify({ type: "alert", title: "Error", message: err.message, impact: "negative" }); }
    finally { setProcessingAction(null); }
  };

  const handleSendPasswordResets = async () => {
    if (!window.confirm(`Send password reset emails to all students?`)) return;
    setProcessingAction("emails");
    logAdminAction("BULK_PASSWORD_RESET", { target: "ALL_STUDENTS" });
    try {
      await httpsCallable('adminSendPasswordResets')({});
      notify({ type: "alert", title: "Emails Sent", message: "Password reset requests dispatched!", impact: "positive" });
    } catch(e: any) {
      notify({ type: "alert", title: "Error", message: e.message, impact: "negative" });
    }
    setProcessingAction(null);
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

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, '').trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, '').trim());
    return result;
  };

  const parseCSV = (type: "news" | "users" | "stocks") => {
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return setCsvErrors(["CSV must contain a header row and at least one data row."]);
    
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
    const errors: string[] = [];
    const results: any[] = [];

    if (type === "news" && headers[0] !== "headline") errors.push("Column 1 must be 'Headline'.");
    if (type === "users" && (!headers.includes("email") || !headers.includes("password"))) errors.push("Missing 'Email' or 'Password' headers.");
    if (type === "stocks" && (!headers.includes("ticker") || !headers.includes("baseprice"))) errors.push("Missing 'Ticker' or 'BasePrice' headers.");

    if (errors.length > 0) return setCsvErrors(errors);

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (cols.length !== headers.length) { errors.push(`Row ${i + 1} has mismatched columns (expected ${headers.length}, got ${cols.length}).`); continue; }
      if (!cols[0]) { errors.push(`Row ${i + 1} is missing a headline.`); continue; }

      if (type === "news") {
        const impacts: Record<string, number> = {};
        for (let j = 1; j < cols.length; j++) {
          const tickerName = headers[j].toUpperCase();
          const impactVal = parseFloat(cols[j]);
          if (!isNaN(impactVal) && impactVal !== 0) {
            impacts[tickerName] = impactVal;
          }
        }
        results.push({ headline: cols[0], stockImpacts: impacts, durationMinutes: eventDuration });
      } else if (type === "users") {
        results.push({ email: cols[0], password: cols[1], name: cols[2] || "Trader", startingBalance: cols[3] || 1000000 });
      } else if (type === "stocks") {
        results.push({ ticker: cols[0].toUpperCase(), name: cols[1], sector: cols[2] || "General", basePrice: parseFloat(cols[3]), volatility: parseFloat(cols[4]) || 0.005 });
      }
    }
    setCsvErrors([]); setParsedData(results); setCsvType(type);
  };

  const downloadSampleNewsCSV = () => {
    const csvContent = [
      "Headline,RELIANCE,TCS,HDFCBANK,ICICIBANK,INFY,BHARTIARTL,ITC,SBIN,LT,MARUTI,TATAMOTORS,SUNPHARMA,AXISBANK,TITAN,TATASTEEL",
      '"RBI Unexpectedly Cuts Repo Rate by 25bps Boosting Liquidity and Credit Growth",0,0,3.8,4.2,0,0,0.5,4.5,2.0,1.8,2.2,0,3.9,1.5,0',
      '"Reliance Inks ₹18000Cr Strategic Green Energy & Solar Gigafactory Pact",5.5,0,0.5,0.8,0,0,0,1.0,2.8,0,0,0,0.5,0,0',
      '"IT Giant Secures $1.4B Generative AI and Cloud Transformation Deal with Fortune 500",0,4.9,0,0,5.4,0,0,0,0,0,0,0,0,0,0'
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "news_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadSampleUsersCSV = () => {
    const csvContent = [
      "Email,Password,Name,StartingBalance",
      "trader1@bazaar.com,Trader@2026,Aarav Sharma,1000000",
      "trader2@bazaar.com,Trader@2026,Priya Patel,1000000"
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "users_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadSampleStocksCSV = () => {
    const csvContent = [
      "Ticker,Name,Sector,BasePrice,Volatility",
      "RELIANCE,Reliance Industries,Energy,2950.0,0.002",
      "TCS,Tata Consultancy Services,IT,4150.0,0.0018"
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stocks_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportData = async () => {
    if (parsedData.length === 0) return;
    setProcessingAction("import");
    logAdminAction("IMPORT_CSV", { type: csvType, recordCount: parsedData.length });
    try {
      if (csvType === "news") await importNewsEvents(parsedData);
      else if (csvType === "users") await httpsCallable( 'adminImportUsers')({ users: parsedData });
      else if (csvType === "stocks") await httpsCallable('adminImportStocks')({ stocks: parsedData });
      
      setParsedData([]); setCsvText(""); 
      notify({ type: "alert", title: "Import Successful", message: `Imported ${parsedData.length} records!`, impact: "positive" });
    } catch (err: any) { notify({ type: "alert", title: "Import Failed", message: err.message, impact: "negative" }); } 
    finally { setProcessingAction(null); }
  };

  const handleAddImpact = () => {
    const ticker = impactTicker.toUpperCase().trim();
    const val = parseFloat(impactValue);
    if (!ticker) return;
    if (isNaN(val)) {
      notify({ type: "alert", title: "Invalid Impact", message: "Please enter a valid percentage (e.g. 5.0 or -3.5)", impact: "negative" });
      return;
    }
    setSingleImpacts(prev => ({ ...prev, [ticker]: val }));
    setImpactValue("");
  };

  const handleDeleteIPO = async (ipoId: string, ticker: string) => {
    if (!window.confirm(`⚠️ Permanently DELETE the IPO for "${ticker}"?\nAll subscriber funds will be automatically refunded to user cash balances.`)) return;
    setProcessingAction(`${ipoId}-delete`);
    logAdminAction("DELETE_IPO", { ipoSymbol: ticker, ipoId });
    try {
      await httpsCallable('adminDeleteIPO')({ ipoId });
      notify({ type: "ipo", title: "IPO Deleted", message: `IPO ${ticker} deleted and applicant funds refunded.`, impact: "neutral" });
    } catch (err: any) {
      notify({ type: "alert", title: "Error deleting IPO", message: err.message, impact: "negative" });
    } finally {
      setProcessingAction(null);
    }
  };

  const handleRemoveImpact = (ticker: string) => {
    setSingleImpacts(prev => {
      const copy = { ...prev };
      delete copy[ticker];
      return copy;
    });
  };

  const handleCreateSingleNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleHeadline.trim()) {
      notify({ type: "alert", title: "Missing Input", message: "Please enter a news headline.", impact: "negative" });
      return;
    }
    setProcessingAction('create-single-news');
    logAdminAction("CREATE_SINGLE_NEWS", { headline: singleHeadline, stockImpacts: singleImpacts });
    try {
      await createSingleNewsEvent({
        headline: singleHeadline.trim(),
        stockImpacts: singleImpacts,
        durationMinutes: singleDuration || 15
      });
      setSingleHeadline("");
      setSingleImpacts({});
      setSingleDuration(15);
      notify({ type: "news", title: "News Queued", message: "News event added to queue as DRAFT!", impact: "positive" });
    } catch (err: any) {
      notify({ type: "alert", title: "Error creating news", message: err.message, impact: "negative" });
    } finally {
      setProcessingAction(null);
    }
  };

  const handleFireNews = async (event: any) => {
    if (!window.confirm(`Trigger event: "${event.headline}" over ${event.durationMinutes || eventDuration} minutes?`)) return;
    setProcessingAction(`fire-${event.eventId || event.id}`);
    logAdminAction("FIRE_NEWS", { eventId: event.eventId || event.id, headline: event.headline });
    try { 
      await releaseEventNow(event.eventId || event.id, event, event.durationMinutes || eventDuration); 
      notify({ type: "news", title: "News Fired", message: "Event pushed to live wire!", impact: "positive" });
    } catch (err: any) { 
      notify({ type: "alert", title: "Error triggering news", message: err.message, impact: "negative" });
    } finally { 
      setProcessingAction(null); 
    }
  };

  const handleTriggerNextNews = async () => {
    setProcessingAction('trigger-next-news');
    logAdminAction("TRIGGER_NEXT_NEWS", {});
    try {
      const res: any = await triggerNextNewsEvent();
      notify({ type: "news", title: "News Fired", message: `Triggered event: "${res?.data?.headline || 'Next in Queue'}" on the live wire!`, impact: "positive" });
    } catch (err: any) {
      notify({ type: "alert", title: "Error", message: err.message, impact: "negative" });
    } finally {
      setProcessingAction(null);
    }
  };

  const handleTriggerAllNews = async () => {
    if (!window.confirm("⚡ Are you sure you want to TRIGGER ALL queued draft news events at once?")) return;
    setProcessingAction('trigger-all-news');
    logAdminAction("TRIGGER_ALL_NEWS", {});
    try {
      const res: any = await triggerAllNewsEvents();
      notify({ type: "news", title: "Bulk News Fired", message: `Successfully triggered ${res?.data?.count || 'all'} queued news events!`, impact: "positive" });
    } catch (err: any) {
      notify({ type: "alert", title: "Error", message: err.message, impact: "negative" });
    } finally {
      setProcessingAction(null);
    }
  };

  const handleDeleteSingleNews = async (eventId: string, headline: string) => {
    if (!window.confirm(`Delete event "${headline}"?`)) return;
    setProcessingAction(`delete-${eventId}`);
    logAdminAction("DELETE_SINGLE_NEWS", { eventId });
    try {
      await deleteSingleNewsEvent(eventId);
      notify({ type: "alert", title: "News Deleted", message: "Event removed from queue.", impact: "neutral" });
    } catch (err: any) {
      notify({ type: "alert", title: "Error", message: err.message, impact: "negative" });
    } finally {
      setProcessingAction(null);
    }
  };

  const handleCancelNews = async (eventId: string) => {
    setProcessingAction(`cancel-${eventId}`);
    logAdminAction("CANCEL_NEWS", { eventId });
    try { 
      await cancelEvent(eventId); 
      notify({ type: "alert", title: "News Cancelled", message: "Live event has been halted.", impact: "neutral" });
    } catch (err: any) { notify({ type: "alert", title: "Error", message: err.message, impact: "negative" }); } 
    finally { setProcessingAction(null); }
  };

  const handleDeleteAllNews = async () => {
    if (!window.confirm("⚠️ Are you sure you want to PERMANENTLY DELETE ALL news events and clear active market influences?")) return;
    setProcessingAction('delete-all-news');
    logAdminAction("DELETE_ALL_NEWS", {});
    try {
      await deleteAllNewsEvents();
      notify({ type: "alert", title: "Queue Cleared", message: "All news events have been wiped.", impact: "neutral" });
    } catch (err: any) {
      notify({ type: "alert", title: "Error", message: err.message, impact: "negative" });
    } finally {
      setProcessingAction(null);
    }
  };

  const handleCreateIPO = async () => {
    if (!ipoName || !ipoTicker || !ipoPrice || !ipoLotSize || !ipoTotalLots) return;
    setProcessingAction('create-ipo');
    logAdminAction("CREATE_IPO", { symbol: ipoTicker.toUpperCase(), companyName: ipoName, totalLots: ipoTotalLots });
    try {
      const startOpen = ipoOpenTime ? new Date(ipoOpenTime).getTime() : Date.now();
      await httpsCallable('adminCreateIPO')({
        name: ipoName, 
        ticker: ipoTicker.toUpperCase(), 
        sector: ipoSector || "Upcoming", // <-- Pass Sector to backend
        price: parseFloat(ipoPrice) || 0, 
        lotSize: parseInt(ipoLotSize, 10) || 1,           
        totalLots: parseInt(ipoTotalLots, 10) || 1,       
        listingPremiumPct: parseFloat(ipoPremium) || 0, 
        openTime: startOpen, 
        closeTime: ipoCloseTime ? new Date(ipoCloseTime).getTime() : Date.now() + 3600000,
        listTime: ipoListTime ? new Date(ipoListTime).getTime() : Date.now() + 7200000
      });
      setIpoName(""); setIpoTicker(""); setIpoSector(""); setIpoPrice(""); setIpoLotSize(""); setIpoTotalLots(""); setIpoPremium(""); setIpoOpenTime(""); setIpoCloseTime(""); setIpoListTime("");
      notify({ type: "ipo", title: "IPO Scheduled", message: "IPO has been initialized successfully!", impact: "positive" });
    } catch (err: any) { notify({ type: "alert", title: "Error creating IPO", message: err.message, impact: "negative" }); } 
    finally { setProcessingAction(null); }
  };

  const handleIPOAction = async (ipoId: string, action: 'close' | 'allot' | 'list') => {
    setProcessingAction(`${ipoId}-${action}`);
    logAdminAction(action === 'allot' ? "RUN_IPO_ALLOTMENT" : action === 'list' ? "LIST_IPO" : "CLOSE_IPO", { ipoSymbol: ipoId });
    try {
      if (action === 'close') {
        await httpsCallable('adminCloseIPO')({ ipoId });
      } else if (action === 'allot') {
        await httpsCallable('processAllotment')({ ipoId });
      } else {
        await httpsCallable('listIPO')({ ipoId });
      }
      notify({ type: "ipo", title: "IPO Status Updated", message: `Successfully executed ${action}.`, impact: "positive" });
    } catch (err: any) { notify({ type: "alert", title: "Error", message: err.message, impact: "negative" }); } 
    finally { setProcessingAction(null); }
  };

  const [editingGmpId, setEditingGmpId] = useState<string | null>(null);
  const [gmpValue, setGmpValue] = useState<string>("");

  const handleUpdateIPOGMP = async (ipoId: string, ticker: string) => {
    const newGmp = parseFloat(gmpValue);
    if (isNaN(newGmp)) return;
    setProcessingAction(`${ipoId}-gmp`);
    logAdminAction("UPDATE_IPO_GMP", { ipoSymbol: ticker, newGMP: newGmp });
    try {
      await httpsCallable('adminUpdateIPOGMP')({ ipoId, listingPremiumPct: newGmp });
      setEditingGmpId(null);
      setGmpValue("");
      notify({ type: "ipo", title: "GMP Updated", message: `GMP for ${ticker} updated to ${newGmp}%`, impact: "positive" });
    } catch (err: any) {
      notify({ type: "alert", title: "Error", message: err.message, impact: "negative" });
    } finally {
      setProcessingAction(null);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'SYSTEM', icon: LayoutDashboard },
    { id: 'market', label: 'MARKET', icon: Sliders },
    { id: 'participants', label: 'TRADERS', icon: Users },
    { id: 'stocks', label: 'STOCKS', icon: BarChart2 },
    { id: 'logs', label: 'ACTIVITY LOGS', icon: ShieldAlert },
    { id: 'news', label: 'NEWS WIRE', icon: Newspaper },
    { id: 'ipo', label: 'IPO', icon: Sparkles },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-root)] text-[var(--text-main)] flex flex-col md:flex-row font-sans transition-colors duration-200">
      <div className="w-full md:w-[220px] bg-[var(--bg-card)] border-b md:border-b-0 md:border-r border-[var(--border-subtle)] flex flex-col sticky top-0 md:h-screen z-50 transition-colors duration-200">
        <div className="p-3 sm:p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <span className="text-amber-500 font-bold tracking-tight text-base sm:text-lg">Admin Dashboard</span>
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <button
              onClick={toggleTheme}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded"
              title="Toggle Theme"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => logoutUser()}
              className="p-1.5 text-[var(--down-color)] rounded"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Horizontal scrollable navigation on mobile, vertical sidebar on desktop */}
        <nav className="flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto py-2 md:py-3 px-2 md:px-0 gap-1 md:gap-0 scrollbar-none flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as Tab)}
                className={`flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 text-[10px] font-bold tracking-widest uppercase transition-colors whitespace-nowrap rounded md:rounded-none text-left ${
                  isActive 
                    ? 'bg-[var(--bg-root)] text-[var(--up-color)] md:border-l-2 md:border-[var(--up-color)] font-black' 
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-root)] md:border-l-2 md:border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="hidden md:block p-3 border-t border-[var(--border-subtle)]">
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

      <div className="flex-1 p-3 sm:p-6 overflow-x-hidden min-w-0">
        <div className="max-w-6xl mx-auto space-y-6">
          
          {activeTab === 'dashboard' && (
            <div className="space-y-4">
              <div className="border-b border-[var(--border-subtle)] pb-3">
                <h1 className="text-sm font-bold uppercase tracking-widest text-[var(--text-main)]">System Overview</h1>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
                <div className="terminal-card p-4 border border-amber-500/40 bg-amber-500/5">
                  <div className="text-amber-400 text-[10px] font-bold uppercase mb-1 flex items-center justify-between">
                    <span>Tax Treasury</span>
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xl font-bold font-mono text-amber-400">
                    ₹{(taxTreasury.totalTaxCollected || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[9px] font-mono text-[var(--text-muted)] mt-1">0.1% STT Accumulated</div>
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
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input type="text" placeholder="TICKER" value={forceTicker} onChange={e => setForceTicker(e.target.value)} className="w-full sm:w-1/3 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-xs uppercase rounded focus:outline-none focus:border-[var(--up-color)]" />
                    <input type="number" placeholder="Price" value={forcePrice} onChange={e => setForcePrice(e.target.value)} className="w-full sm:w-1/3 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-xs rounded focus:outline-none focus:border-[var(--up-color)]" />
                    <button 
                      onClick={handleForcePrice} 
                      disabled={processingAction === 'force-price'} 
                      className="w-full sm:flex-1 py-2 bg-[var(--down-color)] text-white text-[11px] font-bold uppercase rounded hover:opacity-90 disabled:opacity-50 flex items-center justify-center min-h-[36px]"
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
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={downloadSampleUsersCSV}
                        className="flex items-center gap-1 text-[10px] font-mono font-bold text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-blue-400/10 border border-blue-400/25 transition-colors"
                        title="Download sample users CSV"
                      >
                        <Download className="w-3 h-3" />
                        <span>Sample CSV</span>
                      </button>
                      {csvText && (
                        <button onClick={clearCSV} className="text-[var(--down-color)] hover:opacity-80">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={downloadSampleStocksCSV}
                      className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded bg-emerald-400/10 border border-emerald-400/25 transition-colors"
                      title="Download sample stocks CSV"
                    >
                      <Download className="w-3 h-3" />
                      <span>Sample CSV</span>
                    </button>
                    {csvText && (
                      <button onClick={clearCSV} className="text-[var(--down-color)] hover:opacity-80">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
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
                          <tr key={log.id || log.timestamp} className="hover:bg-[var(--bg-root)] transition-colors">
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
              <div className="border-b border-[var(--border-subtle)] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-sm font-bold uppercase tracking-widest text-[var(--text-main)] flex items-center gap-2">
                    <Radio className="w-4 h-4 text-[#3b82f6] animate-pulse" />
                    News Matrix & Live Wire Controller
                  </h1>
                  <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
                    Add news events (single or bulk), manage the queue, and trigger breaking news alerts on demand.
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LEFT COLUMN: NEWS COMPOSER */}
                <div className="lg:col-span-1 terminal-card p-5 space-y-4 h-fit">
                  
                  <div className="flex bg-[var(--bg-root)] p-1 rounded border border-[var(--border-subtle)] font-mono text-[10px]">
                    <button
                      type="button"
                      onClick={() => setNewsInputMode("single")}
                      className={`flex-1 py-1.5 rounded font-bold transition-all flex items-center justify-center gap-1.5 ${
                        newsInputMode === "single"
                          ? "bg-[#3b82f6] text-white shadow-sm"
                          : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                      }`}
                    >
                      <Plus className="w-3 h-3" />
                      <span>Single News</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewsInputMode("bulk")}
                      className={`flex-1 py-1.5 rounded font-bold transition-all flex items-center justify-center gap-1.5 ${
                        newsInputMode === "bulk"
                          ? "bg-amber-400 text-black shadow-sm"
                          : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                      }`}
                    >
                      <Upload className="w-3 h-3" />
                      <span>Bulk CSV</span>
                    </button>
                  </div>

                  {newsInputMode === "single" && (
                    <form onSubmit={handleCreateSingleNews} className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block mb-1">
                          News Headline
                        </label>
                        <textarea
                          value={singleHeadline}
                          onChange={(e) => setSingleHeadline(e.target.value)}
                          placeholder="e.g. Reliance Signs ₹18,000Cr Strategic Green Energy & Solar Gigafactory Pact"
                          rows={3}
                          required
                          className="w-full px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded focus:outline-none focus:border-[#3b82f6]"
                        />
                      </div>

                      <div className="space-y-2 bg-[var(--bg-root)] p-3 rounded border border-[var(--border-subtle)]">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">
                          Stock Price Impacts (%)
                        </label>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            value={impactTicker}
                            onChange={(e) => setImpactTicker(e.target.value)}
                            className="w-full sm:flex-1 min-w-0 px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-xs rounded focus:outline-none focus:border-[#3b82f6]"
                          >
                            {Object.keys(prices).length > 0 ? (
                              Object.entries(prices).map(([ticker, data]: [string, any]) => (
                                <option key={ticker} value={ticker}>
                                  {ticker} ({((data?.name || ticker) as string).slice(0, 16)})
                                </option>
                              ))
                            ) : (
                              STOCKS_CATALOG.map((s) => (
                                <option key={s.ticker} value={s.ticker}>
                                  {s.ticker} ({s.name.slice(0, 14)}...)
                                </option>
                              ))
                            )}
                          </select>

                          <div className="flex gap-2 flex-shrink-0">
                            <input
                              type="number"
                              step="0.1"
                              placeholder="e.g. 5.5 or -3.0"
                              value={impactValue}
                              onChange={(e) => setImpactValue(e.target.value)}
                              className="flex-1 sm:w-28 px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-xs rounded focus:outline-none focus:border-[#3b82f6]"
                            />

                            <button
                              type="button"
                              onClick={handleAddImpact}
                              className="px-4 py-1.5 bg-[var(--border-subtle)] hover:bg-[var(--text-muted)] hover:text-black text-[var(--text-main)] text-[10px] font-bold uppercase rounded transition-colors flex-shrink-0 cursor-pointer"
                            >
                              Add
                            </button>
                          </div>
                        </div>

                        {Object.keys(singleImpacts).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {Object.entries(singleImpacts).map(([tkr, val]) => (
                              <span
                                key={tkr}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${
                                  val >= 0
                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                    : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                                }`}
                              >
                                <span>{tkr}: {val >= 0 ? "+" : ""}{val}%</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveImpact(tkr)}
                                  className="hover:opacity-80"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[9px] text-[var(--text-muted)] font-mono italic">
                            Optional: Add price movement on specific stocks, or leave empty for general macro news.
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">
                          Impact Duration (Mins)
                        </label>
                        <input
                          type="number"
                          value={singleDuration}
                          onChange={(e) => setSingleDuration(parseInt(e.target.value) || 15)}
                          className="w-16 px-2 py-1 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded focus:outline-none focus:border-[#3b82f6]"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={processingAction === "create-single-news"}
                        className="w-full py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white text-[11px] font-bold uppercase rounded flex items-center justify-center gap-2 transition-all shadow-md"
                      >
                        {processingAction === "create-single-news" ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>Queue Single Event (Draft)</span>
                      </button>
                    </form>
                  )}

                  {newsInputMode === "bulk" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-main)]">
                          Bulk CSV Import
                        </h2>
                        <button
                          type="button"
                          onClick={downloadSampleNewsCSV}
                          className="flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400 hover:text-amber-300 px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/25 transition-colors"
                          title="Download sample news CSV"
                        >
                          <Download className="w-3 h-3" />
                          <span>Sample CSV</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono bg-[var(--bg-root)] p-2.5 rounded border border-[var(--border-subtle)] gap-2">
                        <div className="leading-relaxed">
                          Format: <span className="text-[var(--text-main)] font-bold">Headline,TICKER1,TICKER2...</span><br/>
                          Values: % impacts (e.g. +4.5 or -3.2).
                        </div>
                        <button
                          type="button"
                          onClick={downloadSampleNewsCSV}
                          className="px-2 py-1 bg-amber-400 hover:bg-amber-300 text-black font-mono font-bold text-[10px] uppercase rounded flex items-center gap-1 transition-colors flex-shrink-0"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </button>
                      </div>

                      {!csvText ? (
                        <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-[var(--border-subtle)] border-dashed rounded cursor-pointer bg-[var(--bg-root)] hover:opacity-80 transition-colors">
                          <Upload className="w-5 h-5 mb-1 text-[var(--text-muted)]" />
                          <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">
                            Click to upload CSV file
                          </p>
                          <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                        </label>
                      ) : (
                        <textarea
                          value={csvText}
                          onChange={(e) => setCsvText(e.target.value)}
                          className="w-full h-28 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs font-mono rounded focus:outline-none focus:border-[#3b82f6]"
                        />
                      )}

                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">
                          Impact Duration (Mins)
                        </label>
                        <input
                          type="number"
                          value={eventDuration}
                          onChange={(e) => setEventDuration(parseInt(e.target.value) || 15)}
                          className="w-16 px-2 py-1 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded focus:outline-none focus:border-[#3b82f6]"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => parseCSV("news")}
                          disabled={!csvText}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] disabled:opacity-50 text-[var(--text-main)] text-[11px] font-bold uppercase rounded transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" /> Validate CSV
                        </button>
                        {csvText && (
                          <button
                            type="button"
                            onClick={clearCSV}
                            className="px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--down-color)] hover:opacity-80 rounded text-xs font-bold"
                            title="Clear"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {csvErrors.length > 0 && (
                        <div className="p-3 bg-[#f2364515] border border-[var(--down-color)] rounded mt-2">
                          <ul className="list-disc pl-4 text-[10px] text-[var(--down-color)]">
                            {csvErrors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {parsedData.length > 0 && csvType === "news" && (
                        <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
                          <h3 className="text-xs font-bold text-[var(--text-main)] mb-2 font-mono">
                            Preview ({parsedData.length} Events Validated)
                          </h3>
                          <button
                            type="button"
                            onClick={handleImportData}
                            disabled={processingAction === "import"}
                            className="w-full py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black text-[11px] font-bold uppercase rounded flex items-center justify-center gap-2 transition-all shadow-sm"
                          >
                            {processingAction === "import" ? (
                              <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            <span>Import All to Queue (Draft)</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                </div>

                {/* RIGHT COLUMN: EVENT QUEUE & TELEMETRY */}
                <div className="lg:col-span-2 terminal-card overflow-hidden flex flex-col">
                  
                  <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-root)] flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-main)] flex items-center gap-2">
                        <span>Event Queue & Live Wire</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-amber-400/20 text-amber-400 border border-amber-400/30">
                          {adminEvents.filter(e => e.status === "draft").length} Drafts
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {adminEvents.filter(e => e.status === "active").length} Active
                        </span>
                      </h2>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleTriggerNextNews}
                        disabled={adminEvents.filter(e => e.status === "draft").length === 0 || processingAction === "trigger-next-news"}
                        className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-black rounded text-[10px] font-mono font-black uppercase flex items-center gap-1.5 transition-all shadow-sm"
                        title="Trigger the next queued draft news story on the wire"
                      >
                        {processingAction === "trigger-next-news" ? (
                          <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 fill-black" />
                        )}
                        <span>Trigger Next</span>
                      </button>

                      {adminEvents.filter(e => e.status === "draft").length > 1 && (
                        <button
                          type="button"
                          onClick={handleTriggerAllNews}
                          disabled={processingAction === "trigger-all-news"}
                          className="px-3 py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-40 text-white rounded text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 transition-all shadow-sm"
                          title="Trigger all queued drafts at once"
                        >
                          {processingAction === "trigger-all-news" ? (
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>Trigger All ({adminEvents.filter(e => e.status === "draft").length})</span>
                        </button>
                      )}

                      {adminEvents.length > 0 && (
                        <button
                          type="button"
                          onClick={handleDeleteAllNews}
                          disabled={processingAction === "delete-all-news"}
                          className="px-2.5 py-1.5 bg-[#f2364515] border border-[var(--down-color)] text-[var(--down-color)] hover:bg-[var(--down-color)] hover:text-white rounded text-[10px] font-mono font-bold uppercase flex items-center gap-1 transition-colors disabled:opacity-50"
                          title="Permanently delete all news events"
                        >
                          {processingAction === "delete-all-news" ? (
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          <span>Wipe All</span>
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {adminEvents.length === 0 ? (
                    <div className="p-8 flex flex-col items-center justify-center text-[var(--text-muted)] py-16">
                      <Newspaper className="w-10 h-10 mb-2 opacity-30" />
                      <p className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        Event Queue is Empty
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono mt-1 text-center max-w-sm">
                        Use the single composer on the left or upload a bulk CSV to add draft news into the queue.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                      {adminEvents.map((evt, idx) => {
                        const isDraft = evt.status === "draft";
                        const isActive = evt.status === "active";

                        return (
                          <div
                            key={evt.id || evt.eventId}
                            className={`p-4 rounded-xl border transition-all ${
                              isActive
                                ? "bg-[#3b82f608] border-[#3b82f650] shadow-sm"
                                : isDraft
                                ? "bg-[var(--bg-root)] border-[var(--border-subtle)] hover:border-amber-400/40"
                                : "bg-[var(--bg-root)] border-[var(--border-subtle)] opacity-70"
                            }`}
                          >
                            <div className="flex justify-between items-start gap-3 mb-2">
                              <div className="flex items-start gap-2">
                                <span className="text-[10px] font-mono text-[var(--text-muted)] font-bold mt-0.5">
                                  #{idx + 1}
                                </span>
                                <h3 className="text-xs sm:text-sm font-bold text-[var(--text-main)] leading-snug">
                                  {evt.headline}
                                </h3>
                              </div>

                              <span
                                className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded flex items-center gap-1 flex-shrink-0 ${
                                  isActive
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : isDraft
                                    ? "bg-amber-400/15 text-amber-300 border border-amber-400/30"
                                    : evt.status === "cancelled"
                                    ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                    : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                                }`}
                              >
                                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
                                <span>{isActive ? "LIVE ON WIRE" : isDraft ? "QUEUED DRAFT" : evt.status}</span>
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 mt-2.5 text-[10px] font-mono">
                              <span className="text-[9px] text-[var(--text-muted)] uppercase">Impacts:</span>
                              {Object.keys(evt.stockImpacts || {}).length > 0 ? (
                                Object.entries(evt.stockImpacts || {}).map(([tkr, pct]: any) => (
                                  <span
                                    key={tkr}
                                    className={`px-1.5 py-0.5 rounded border ${
                                      pct >= 0
                                        ? "border-[var(--up-color)] text-[var(--up-color)] bg-[#08998115]"
                                        : "border-[var(--down-color)] text-[var(--down-color)] bg-[#f2364515]"
                                    }`}
                                  >
                                    {tkr}: {pct > 0 ? "+" : ""}{pct}%
                                  </span>
                                ))
                              ) : (
                                <span className="text-[var(--text-muted)] italic">Macro (General)</span>
                              )}
                              <span className="text-[9px] text-[var(--text-muted)] ml-auto">
                                Duration: {evt.durationMinutes || 15}m
                              </span>
                            </div>

                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-subtle)] font-mono text-[10px]">
                              <span className="text-[9px] text-[var(--text-muted)]">
                                {isDraft
                                  ? "Created: " + new Date(evt.createdAt || Date.now()).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                                  : "Fired: " + new Date(evt.startTime || evt.createdAt || Date.now()).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </span>

                              <div className="flex items-center gap-2">
                                {isDraft && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleFireNews(evt)}
                                      disabled={processingAction === `fire-${evt.eventId || evt.id}`}
                                      className="px-3 py-1 bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase rounded flex items-center gap-1 transition-all shadow-sm"
                                    >
                                      {processingAction === `fire-${evt.eventId || evt.id}` ? (
                                        <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <Zap className="w-3 h-3 fill-black" />
                                      )}
                                      <span>Trigger Event</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSingleNews(evt.eventId || evt.id, evt.headline)}
                                      disabled={processingAction === `delete-${evt.eventId || evt.id}`}
                                      className="p-1 text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}

                                {isActive && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelNews(evt.eventId || evt.id)}
                                    disabled={processingAction === `cancel-${evt.eventId || evt.id}`}
                                    className="px-2.5 py-1 bg-[var(--bg-card)] hover:bg-[var(--bg-root)] text-[var(--text-muted)] hover:text-white border border-[var(--border-subtle)] text-[9px] font-bold uppercase rounded flex items-center gap-1 transition-colors"
                                  >
                                    {processingAction === `cancel-${evt.eventId || evt.id}` ? (
                                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      "Halt / Cancel"
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
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
                    {/* UPDATED IPO GRID TO INCLUDE SECTOR */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="col-span-1 sm:col-span-1">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Company Name</label>
                        <input type="text" value={ipoName} onChange={(e) => setIpoName(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded focus:outline-none focus:border-[#f59e0b]" placeholder="Quantum AI" />
                      </div>
                      <div className="col-span-1 sm:col-span-1">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Ticker</label>
                        <input type="text" value={ipoTicker} onChange={(e) => setIpoTicker(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded uppercase focus:outline-none focus:border-[#f59e0b]" placeholder="QAI" />
                      </div>
                      <div className="col-span-1 sm:col-span-1">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Sector</label>
                        <input type="text" value={ipoSector} onChange={(e) => setIpoSector(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded focus:outline-none focus:border-[#f59e0b]" placeholder="Tech" />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Price / Share</label>
                        <input type="number" value={ipoPrice} onChange={(e) => setIpoPrice(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded focus:outline-none focus:border-[#f59e0b]" placeholder="₹" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Lot Size</label>
                        <input type="number" value={ipoLotSize} onChange={(e) => setIpoLotSize(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded focus:outline-none focus:border-[#f59e0b]" placeholder="Qty" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Total Lots</label>
                        <input type="number" value={ipoTotalLots} onChange={(e) => setIpoTotalLots(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs rounded focus:outline-none focus:border-[#f59e0b]" placeholder="Max Lots" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
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
                        <th className="p-3 text-right">Price/Lot</th>
                        <th className="p-3 text-right">Hike (GMP)</th>
                        <th className="p-3 text-right">Subscription</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-right">Manual Override</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {ipos.map(ipo => {
                        const costPerLot = (Number(ipo.price) || 0) * (Number(ipo.lotSize) || 1);
                        const subRate = ipo.subscriptionRate !== undefined ? Number(ipo.subscriptionRate) : Number(((Number(ipo.totalSubscribedLots) || 0) / (Number(ipo.totalLots) || 1)).toFixed(2));
                        return (
                          <tr key={ipo.id || ipo.ipoId} className="hover:bg-[var(--bg-root)] transition-colors">
                            <td className="p-3 text-[var(--text-main)] font-bold">
                              {ipo.ticker} <span className="block text-[9px] font-normal text-[var(--text-muted)]">{ipo.lotSize} shares/lot</span>
                            </td>
                            <td className="p-3 text-right text-[var(--text-main)]">₹{costPerLot.toFixed(2)}</td>
                            <td className="p-3 text-right">
                              {editingGmpId === (ipo.id || ipo.ipoId) ? (
                                <div className="flex items-center justify-end gap-1 font-mono">
                                  <input 
                                    type="number"
                                    value={gmpValue}
                                    onChange={(e) => setGmpValue(e.target.value)}
                                    className="w-16 px-1.5 py-0.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded text-right text-xs text-[var(--up-color)] font-bold focus:outline-none"
                                    placeholder={`${ipo.listingPremiumPct || 0}`}
                                    autoFocus
                                  />
                                  <span className="text-[10px] text-[var(--text-muted)]">%</span>
                                  <button
                                    onClick={() => handleUpdateIPOGMP((ipo.id || ipo.ipoId), ipo.ticker)}
                                    disabled={processingAction === `${ipo.id || ipo.ipoId}-gmp`}
                                    className="px-1.5 py-0.5 bg-[var(--up-color)] text-white text-[10px] rounded font-bold hover:opacity-90"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingGmpId(null)}
                                    className="px-1.5 py-0.5 bg-[var(--bg-root)] text-[var(--text-muted)] text-[10px] rounded border border-[var(--border-subtle)]"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5 group">
                                  <span className={`font-bold ${Number(ipo.listingPremiumPct || 0) > 0 ? 'text-[var(--up-color)]' : Number(ipo.listingPremiumPct || 0) < 0 ? 'text-[var(--down-color)]' : 'text-[var(--text-muted)]'}`}>
                                    {Number(ipo.listingPremiumPct || 0) > 0 ? `+${ipo.listingPremiumPct}%` : `${ipo.listingPremiumPct || 0}%`}
                                  </span>
                                  <button
                                    onClick={() => { setEditingGmpId(ipo.id || ipo.ipoId); setGmpValue(String(ipo.listingPremiumPct || 0)); }}
                                    className="opacity-40 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-amber-400 text-[10px] rounded transition-opacity"
                                    title="Edit GMP"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <div className={`font-bold ${subRate >= 1.0 ? 'text-[var(--up-color)]' : subRate > 0 ? 'text-[#3b82f6]' : 'text-[var(--text-muted)]'}`}>
                                {subRate.toFixed(2)}x
                              </div>
                              <div className="text-[9px] text-[var(--text-muted)]">
                                {ipo.totalSubscribedLots || 0}/{ipo.totalLots || 1} lots ({ipo.subscriptionCount || 0} bids)
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                                ipo.status === 'upcoming' ? 'bg-[#f59e0b15] text-[#f59e0b]' :
                                ipo.status === 'open' ? 'bg-[#08998115] text-[var(--up-color)] animate-pulse' :
                                ipo.status === 'allotting' ? 'bg-[#8b5cf615] text-[#8b5cf6] animate-pulse' :
                                'bg-[#3b82f615] text-[#3b82f6]'
                              }`}>{ipo.status}</span>
                            </td>
                            <td className="p-3 flex justify-end gap-1.5">
                              <button 
                                onClick={() => handleIPOAction((ipo.id || ipo.ipoId), 'close')}
                                disabled={ipo.status !== 'open' || processingAction === `${ipo.id || ipo.ipoId}-close`}
                                className="px-2 py-1 flex items-center gap-1 bg-[#f59e0b15] hover:opacity-80 border border-[#f59e0b50] disabled:opacity-50 text-[#f59e0b] rounded text-[9px] font-bold uppercase justify-center transition-opacity"
                              >
                                {processingAction === `${ipo.id || ipo.ipoId}-close` ? <div className="w-3 h-3 border-2 border-[#f59e0b] border-t-transparent rounded-full animate-spin" /> : <><Pause className="w-3 h-3" /> Close</>}
                              </button>
                              <button 
                                onClick={() => handleIPOAction((ipo.id || ipo.ipoId), 'allot')}
                                disabled={ipo.status !== 'closed' || processingAction === `${ipo.id || ipo.ipoId}-allot`}
                                className="px-2 py-1 flex items-center gap-1 bg-[var(--bg-root)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] disabled:opacity-50 text-[var(--text-main)] rounded text-[9px] font-bold uppercase justify-center transition-colors"
                              >
                                {processingAction === `${ipo.id || ipo.ipoId}-allot` ? <div className="w-3 h-3 border-2 border-[var(--text-main)] border-t-transparent rounded-full animate-spin" /> : <><CheckCircle className="w-3 h-3" /> Allot</>}
                              </button>
                              <button 
                                onClick={() => handleIPOAction((ipo.id || ipo.ipoId), 'list')}
                                disabled={ipo.status !== 'allotted' || processingAction === `${ipo.id || ipo.ipoId}-list`}
                                className="px-2 py-1 flex items-center gap-1 bg-[#08998115] hover:opacity-80 border border-[#08998150] disabled:opacity-50 text-[var(--up-color)] rounded text-[9px] font-bold uppercase justify-center transition-opacity"
                              >
                                 {processingAction === `${ipo.id || ipo.ipoId}-list` ? <div className="w-3 h-3 border-2 border-[var(--up-color)] border-t-transparent rounded-full animate-spin" /> : <><Sparkles className="w-3 h-3" /> List</>}
                              </button>
                              <button 
                                onClick={() => handleDeleteIPO((ipo.id || ipo.ipoId), ipo.ticker)}
                                disabled={processingAction === `${ipo.id || ipo.ipoId}-delete`}
                                className="px-2 py-1 flex items-center gap-1 bg-[#f2364515] hover:opacity-80 border border-[#f2364550] disabled:opacity-50 text-[#f23645] rounded text-[9px] font-bold uppercase justify-center transition-opacity"
                                title="Delete IPO and refund subscribers"
                              >
                                 {processingAction === `${ipo.id || ipo.ipoId}-delete` ? <div className="w-3 h-3 border-2 border-[#f23645] border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
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
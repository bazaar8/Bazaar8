import { Terminal } from "lucide-react";

export default function Register() {
  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4 font-sans">
      <div className="terminal-card max-w-sm w-full p-8 text-center border-t-4 border-t-emerald-500">
        <Terminal className="w-8 h-8 text-gray-600 mx-auto mb-4" />
        <h1 className="text-sm font-bold text-white uppercase tracking-widest mb-2">Registration Closed</h1>
        <p className="text-[10px] font-mono text-gray-500 leading-relaxed">
          Trader accounts are provisioned exclusively by the exchange administrator. 
          Please contact your institutional clearing desk for terminal credentials.
        </p>
      </div>
    </div>
  );
}
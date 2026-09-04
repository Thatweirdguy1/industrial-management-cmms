"use client";

import { useEffect, useState } from "react";
import LoadingScreen from "../components/LoadingScreen";

interface Machine {
  id: number;
  name: string;
  asset_tag: string;
  status: string;
}

export default function MobileMachineApp() {
  const [machine, setMachine] = useState<Machine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState<"home" | "fault" | "pm">("home");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("mechanical");
  const [supervisor, setSupervisor] = useState("");

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";

  useEffect(() => {
    const fetchMachine = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const id = urlParams.get("id");

      if (!id) {
        setError("Invalid QR Code / अमान्य क्यूआर कोड");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${baseUrl}/api/machines`);
        const data: Machine[] = await res.json();
        const foundMachine = data.find((m) => m.id.toString() === id);
        if (foundMachine) setMachine(foundMachine);
        else setError("Machine not found / मशीन नहीं मिली");
      } catch {
        setError("Server Error / सर्वर त्रुटि");
      } finally {
        setLoading(false);
      }
    };

    fetchMachine();
  }, [baseUrl]);

  const handleFaultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("machine_id", String(machine?.id));
    formData.append("task_category", category);
    formData.append("description", description);

    try {
      const res = await fetch(`${baseUrl}/api/work-orders/report`, { method: "POST", body: formData });
      if (res.ok) {
        alert("Breakdown Reported! / खराबी दर्ज की गई!");
        window.location.reload();
      } else alert("Error reporting / रिपोर्ट करने में त्रुटि");
    } catch {
      alert("Network Error / नेटवर्क त्रुटि");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePMSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("machine_id", String(machine?.id));
    formData.append("task_category", category);
    formData.append("description", description);
    formData.append("supervisor_name", supervisor);

    try {
      const res = await fetch(`${baseUrl}/api/work-orders/preventive`, { method: "POST", body: formData });
      if (res.ok) {
        alert("Service Logged! / सर्विस दर्ज की गई!");
        window.location.reload();
      } else alert("Error logging service / सर्विस दर्ज करने में त्रुटि");
    } catch {
      alert("Network Error / नेटवर्क त्रुटि");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen label="Loading machine / मशीन लोड हो रही है" />;
  if (error) return <div className="min-h-screen bg-[#F9F9F7] border-2 border-[#111111] p-8 text-center text-red-500 font-serif flex items-center justify-center">{error}</div>;
  if (!machine) return null;

  return (
    <div className="min-h-screen bg-[#F9F9F7] border-2 border-[#111111] text-[#111111] font-sans selection:bg-purple-500/30">
      <div className="bg-[#F9F9F7] border-2 border-[#111111] p-6 shadow-lg sticky top-0 z-10">
        <div className="flex justify-between items-start mb-2">
          <span className={`px-3 py-1 text-[10px] font-serif tracking-wide uppercase border ${machine.status === "breakdown" ? "bg-red-500/20 text-[#CC0000] border-red-500/50 animate-pulse" : "bg-emerald-500/20 text-[#CC0000] border-emerald-500/50"}`}>
            {machine.status === "breakdown" ? "OFFLINE / बंद" : "ONLINE / चालू"}
          </span>
          <span className="text-[#737373] text-xs font-mono bg-[#F9F9F7] border-2 border-[#111111] px-2 py-1">ID: {String(machine.id).padStart(3, "0")}</span>
        </div>
        <h1 className="text-2xl font-black text-[#111111] leading-tight flex items-center gap-3"><strong>{String(machine.id).padStart(3, "0")}</strong> - {machine.name}</h1>
        <p className="text-[#525252] font-mono text-sm mt-2">{machine.asset_tag}</p>
      </div>

      <div className="p-6">
        {activeView === "home" && (
          <div className="space-y-4 mt-4">
            <button onClick={() => setActiveView("fault")} title="Report an active machine breakdown" className="w-full btn-danger py-5 transition-all active:scale-95 flex flex-col items-center justify-center gap-2">
              <span className="text-2xl">🚨</span><span className="text-xl tracking-wide">REPORT BREAKDOWN</span><span className="text-sm font-medium opacity-80">मशीन की खराबी दर्ज करें</span>
            </button>
            <button onClick={() => setActiveView("pm")} title="Log preventive maintenance for this machine" className="w-full btn-primary py-5 transition-all active:scale-95 flex flex-col items-center justify-center gap-2">
              <span className="text-2xl">🛠️</span><span className="text-xl tracking-wide">LOG SERVICE (PM)</span><span className="text-sm font-medium opacity-80">मशीन सर्विस दर्ज करें</span>
            </button>
          </div>
        )}

        {activeView === "fault" && (
          <form onSubmit={handleFaultSubmit} className="space-y-6 mt-4">
            <div className="bg-[#F9F9F7] border-2 border-[#111111] p-5">
              <h2 className="text-[#CC0000] font-serif mb-4 flex items-center gap-2"><span className="text-xl">🚨</span> Report Breakdown</h2>
              <div className="space-y-4">
                <div><label className="block text-[#525252] text-sm mb-1">Category / श्रेणी</label><select className="w-full bg-[#F9F9F7] border-2 border-[#111111] p-3 text-[#111111]" value={category} onChange={(e) => setCategory(e.target.value)}><option value="mechanical">Mechanical (मैकेनिकल)</option><option value="electrical">Electrical (इलेक्ट्रिकल)</option><option value="other">Other (अन्य)</option></select></div>
                <div><label className="block text-[#525252] text-sm mb-1">Issue Details / विवरण</label><textarea required rows={4} className="w-full bg-[#F9F9F7] border-2 border-[#111111] p-3 text-[#111111]" placeholder="Describe the problem..." value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              </div>
            </div>
            <div className="flex gap-3"><button type="button" onClick={() => setActiveView("home")} className="flex-1 bg-[#111111] text-[#F9F9F7] py-4">CANCEL</button><button type="submit" disabled={isSubmitting} className="flex-1 bg-[#111111] text-[#F9F9F7] py-4 disabled:opacity-50">{isSubmitting ? "SENDING..." : "SUBMIT FAULT"}</button></div>
          </form>
        )}

        {activeView === "pm" && (
          <form onSubmit={handlePMSubmit} className="space-y-6 mt-4">
            <div className="bg-[#F9F9F7] border-2 border-[#111111] p-5">
              <h2 className="text-[#CC0000] font-serif mb-4 flex items-center gap-2"><span className="text-xl">🛠️</span> Log Service</h2>
              <div className="space-y-4">
                <div><label className="block text-[#525252] text-sm mb-1">Service Type / सर्विस का प्रकार</label><select className="w-full bg-[#F9F9F7] border-2 border-[#111111] p-3 text-[#111111]" value={category} onChange={(e) => setCategory(e.target.value)}><option value="mechanical">Mechanical (मैकेनिकल)</option><option value="electrical">Electrical (इलेक्ट्रिकल)</option><option value="cleaning">Cleaning/Oiling (सफाई / तेल)</option></select></div>
                <div><label className="block text-[#525252] text-sm mb-1">Technician Name / तकनीशियन का नाम</label><input required type="text" className="w-full bg-[#F9F9F7] border-2 border-[#111111] p-3 text-[#111111]" placeholder="Enter name..." value={supervisor} onChange={(e) => setSupervisor(e.target.value)} /></div>
                <div><label className="block text-[#525252] text-sm mb-1">Service Notes / सर्विस विवरण</label><textarea required rows={3} className="w-full bg-[#F9F9F7] border-2 border-[#111111] p-3 text-[#111111]" placeholder="What was done?" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              </div>
            </div>
            <div className="flex gap-3"><button type="button" onClick={() => setActiveView("home")} className="flex-1 bg-[#111111] text-[#F9F9F7] py-4">CANCEL</button><button type="submit" disabled={isSubmitting} className="flex-1 bg-[#111111] text-[#F9F9F7] py-4 disabled:opacity-50">{isSubmitting ? "SAVING..." : "LOG SERVICE"}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

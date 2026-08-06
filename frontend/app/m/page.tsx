"use client";

import { useEffect, useState } from "react";

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

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://168.144.81.103:5000";

  useEffect(() => {
    const fetchMachine = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const id = urlParams.get('id');

      if (!id) {
        setError("Invalid QR Code / अमान्य क्यूआर कोड");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${baseUrl}/api/machines`);
        const data = await res.json();
        const foundMachine = data.find((m: Machine) => m.id.toString() === id);

        if (foundMachine) {
          setMachine(foundMachine);
        } else {
          setError("Machine not found / मशीन नहीं मिली");
        }
      } catch (err) {
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
    formData.append('machine_id', String(machine?.id));
    formData.append('task_category', category);
    formData.append('description', description);

    try {
      const res = await fetch(`${baseUrl}/api/work-orders/report`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        alert("Breakdown Reported! / खराबी दर्ज की गई!");
        window.location.reload();
      } else {
        alert("Error reporting / रिपोर्ट करने में त्रुटि");
      }
    } catch (err) {
      alert("Network Error / नेटवर्क त्रुटि");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePMSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append('machine_id', String(machine?.id));
    formData.append('task_category', category);
    formData.append('description', description);
    formData.append('supervisor_name', supervisor);

    try {
      const res = await fetch(`${baseUrl}/api/work-orders/preventive`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        alert("Service Logged! / सर्विस दर्ज की गई!");
        window.location.reload();
      } else {
        alert("Error logging service / सर्विस दर्ज करने में त्रुटि");
      }
    } catch (err) {
      alert("Network Error / नेटवर्क त्रुटि");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#0A0A0A] bg-artdeco-pattern border-2 border-[#D4AF37]/30 p-8 text-center text-[#F2F0E4] flex items-center justify-center">Loading / लोड हो रहा है...</div>;
  if (error) return <div className="min-h-screen bg-[#0A0A0A] bg-artdeco-pattern border-2 border-[#D4AF37]/30 p-8 text-center text-red-500 font-display flex items-center justify-center">{error}</div>;
  if (!machine) return null;

  return (
    <div className="min-h-screen bg-[#0A0A0A] bg-artdeco-pattern border-2 border-[#D4AF37]/30 text-[#F2F0E4] font-sans selection:bg-purple-500/30">
      {/* HEADER WITH PADDED 3-DIGIT ID */}
      <div className="bg-[#0A0A0A] bg-artdeco-pattern border-2 border-[#D4AF37]/30 shadow-artdeco-glow hover-artdeco-glow border-b border-[#D4AF37]/30 border hover:border-[#D4AF37] p-6 shadow-lg sticky top-0 z-10">
        <div className="flex justify-between items-start mb-2">
          <span className={`px-3 py-1 rounded-none-none text-[10px] font-display tracking-wide uppercase border ${machine.status === 'breakdown' ? 'bg-red-500/20 text-[#D4AF37] border-red-500/50 animate-pulse' : 'bg-emerald-500/20 text-[#D4AF37] border-emerald-500/50'}`}>
            {machine.status === 'breakdown' ? 'OFFLINE / बंद' : 'ONLINE / चालू'}
          </span>
          <span className="text-[#888888]/80 text-xs font-mono bg-[#0A0A0A] bg-artdeco-pattern border-2 border-[#D4AF37]/30 px-2 py-1 rounded-none">
            ID: {String(machine.id).padStart(3, '0')}
          </span>
        </div>
        
        <h1 className="text-2xl font-black text-[#F2F0E4] leading-tight flex items-center gap-3">
          <strong>{String(machine.id).padStart(3, '0')}</strong> - {machine.name}
        </h1>
        
        <p className="text-[#888888] font-mono text-sm mt-2">{machine.asset_tag}</p>
      </div>

      {/* MAIN BUTTONS */}
      <div className="p-6">
        {activeView === "home" && (
          <div className="space-y-4 mt-4">
            <button 
              onClick={() => setActiveView("fault")}
              className="w-full bg-[#D4AF37] text-black font-display tracking-[0.1em] border-2 border-[#D4AF37] shadow-artdeco-glow hover:bg-red-500 text-[#F2F0E4] font-display py-5 rounded-none-none shadow-lg border border-red-500 transition-all active:scale-95 flex flex-col items-center justify-center gap-2"
            >
              <span className="text-2xl">🚨</span>
              <span className="text-xl tracking-wide">REPORT BREAKDOWN</span>
              <span className="text-sm font-medium opacity-80">मशीन की खराबी दर्ज करें</span>
            </button>

            <button 
              onClick={() => setActiveView("pm")}
              className="w-full bg-[#1E3D59] text-[#F2F0E4] font-display tracking-[0.1em] hover:bg-purple-500 text-[#F2F0E4] font-display py-5 rounded-none-none shadow-lg border border-purple-500 transition-all active:scale-95 flex flex-col items-center justify-center gap-2"
            >
              <span className="text-2xl">🛠️</span>
              <span className="text-xl tracking-wide">LOG SERVICE (PM)</span>
              <span className="text-sm font-medium opacity-80">मशीन सर्विस दर्ज करें</span>
            </button>
          </div>
        )}

        {/* FAULT REPORTING FORM */}
        {activeView === "fault" && (
          <form onSubmit={handleFaultSubmit} className="space-y-6 mt-4">
            <div className="bg-[#0A0A0A] bg-artdeco-pattern border-2 border-[#D4AF37]/30 shadow-artdeco-glow hover-artdeco-glow p-5 rounded-none-none border border-[#D4AF37]/30 border hover:border-[#D4AF37]">
              <h2 className="text-[#D4AF37] font-display mb-4 flex items-center gap-2">
                <span className="text-xl">🚨</span> Report Breakdown
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[#888888] text-sm mb-1">Category / श्रेणी</label>
                  <select 
                    className="w-full bg-[#0A0A0A] bg-artdeco-pattern border-2 border-[#D4AF37]/30 border border-[#D4AF37]/30 border hover:border-[#D4AF37] rounded-none-none p-3 text-[#F2F0E4] focus:border-red-500 outline-none"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="mechanical">Mechanical (मैकेनिकल)</option>
                    <option value="electrical">Electrical (इलेक्ट्रिकल)</option>
                    <option value="other">Other (अन्य)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#888888] text-sm mb-1">Issue Details / विवरण</label>
                  <textarea 
                    required
                    rows={4}
                    className="w-full bg-[#0A0A0A] bg-artdeco-pattern border-2 border-[#D4AF37]/30 border border-[#D4AF37]/30 border hover:border-[#D4AF37] rounded-none-none p-3 text-[#F2F0E4] focus:border-red-500 outline-none"
                    placeholder="Describe the problem..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  ></textarea>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={() => setActiveView("home")}
                className="flex-1 bg-[#1E3D59] text-[#F2F0E4] py-4 rounded-none-none font-display"
              >
                CANCEL
              </button>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="flex-1 bg-[#D4AF37] text-black font-display tracking-[0.1em] border-2 border-[#D4AF37] shadow-artdeco-glow text-[#F2F0E4] py-4 rounded-none-none font-display disabled:opacity-50"
              >
                {isSubmitting ? "SENDING..." : "SUBMIT FAULT"}
              </button>
            </div>
          </form>
        )}

        {/* PREVENTIVE MAINTENANCE FORM */}
        {activeView === "pm" && (
          <form onSubmit={handlePMSubmit} className="space-y-6 mt-4">
            <div className="bg-[#0A0A0A] bg-artdeco-pattern border-2 border-[#D4AF37]/30 shadow-artdeco-glow hover-artdeco-glow p-5 rounded-none-none border border-[#D4AF37]/30 border hover:border-[#D4AF37]">
              <h2 className="text-[#D4AF37] font-display mb-4 flex items-center gap-2">
                <span className="text-xl">🛠️</span> Log Service
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[#888888] text-sm mb-1">Service Type / सर्विस का प्रकार</label>
                  <select 
                    className="w-full bg-[#0A0A0A] bg-artdeco-pattern border-2 border-[#D4AF37]/30 border border-[#D4AF37]/30 border hover:border-[#D4AF37] rounded-none-none p-3 text-[#F2F0E4] focus:border-purple-500 outline-none"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="mechanical">Mechanical (मैकेनिकल)</option>
                    <option value="electrical">Electrical (इलेक्ट्रिकल)</option>
                    <option value="cleaning">Cleaning/Oiling (सफाई / तेल)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#888888] text-sm mb-1">Technician Name / तकनीशियन का नाम</label>
                  <input 
                    required
                    type="text"
                    className="w-full bg-[#0A0A0A] bg-artdeco-pattern border-2 border-[#D4AF37]/30 border border-[#D4AF37]/30 border hover:border-[#D4AF37] rounded-none-none p-3 text-[#F2F0E4] focus:border-purple-500 outline-none"
                    placeholder="Enter name..."
                    value={supervisor}
                    onChange={(e) => setSupervisor(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[#888888] text-sm mb-1">Service Notes / सर्विस विवरण</label>
                  <textarea 
                    required
                    rows={3}
                    className="w-full bg-[#0A0A0A] bg-artdeco-pattern border-2 border-[#D4AF37]/30 border border-[#D4AF37]/30 border hover:border-[#D4AF37] rounded-none-none p-3 text-[#F2F0E4] focus:border-purple-500 outline-none"
                    placeholder="What was done?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  ></textarea>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={() => setActiveView("home")}
                className="flex-1 bg-[#1E3D59] text-[#F2F0E4] py-4 rounded-none-none font-display"
              >
                CANCEL
              </button>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="flex-1 bg-[#1E3D59] text-[#F2F0E4] font-display tracking-[0.1em] text-[#F2F0E4] py-4 rounded-none-none font-display disabled:opacity-50"
              >
                {isSubmitting ? "SAVING..." : "LOG SERVICE"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
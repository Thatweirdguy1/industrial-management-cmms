"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";

interface Machine {
  id: number;
  name: string;
  asset_tag: string;
  status: string;
  last_maintenance: string;
  next_maintenance: string;
  risk_score?: number;
  active_breakdown_id?: number;
}

interface HistoryLog {
  id: number;
  schedule_type: string;
  task_category: string;
  description: string;
  created_at: string;
  completed_at: string;
  time_taken_hours: number;
  technician: string;
  photos: string[];
}

interface SparePart {
  id: number;
  part_name: string;
  part_number: string;
  quantity: number;
  photo_url: string | null;
}

interface MachineReport {
  id: number;
  engineer_type: string;
  engineer_name: string;
  notes: string;
  file_url: string | null;
  created_at: string;
}

export default function MachineDirectory() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  
  const [activeTab, setActiveTab] = useState<"breakdowns" | "pms" | "inventory" | "reports">("breakdowns");
  const [activeView, setActiveView] = useState<"home" | "fault" | "pm" | "resolve">("home");
  
  const [history, setHistory] = useState<HistoryLog[]>([]);
  const [parts, setParts] = useState<SparePart[]>([]);
  const [reports, setReports] = useState<MachineReport[]>([]); 
  const [isPanelLoading, setIsPanelLoading] = useState(false);
  
  const [showAddPart, setShowAddPart] = useState(false);
  const [newPartName, setNewPartName] = useState("");
  const [newPartNumber, setNewPartNumber] = useState("");
  const [newPartQuantity, setNewPartQuantity] = useState(1);
  const [newPartPhoto, setNewPartPhoto] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [description, setDescription] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [category, setCategory] = useState("mechanical");
  const [supervisor, setSupervisor] = useState("");

  const [error, setError] = useState("");
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [supervisorName, setSupervisorName] = useState(""); 
  const [technicianName, setTechnicianName] = useState("");
  const [operatorName, setOperatorName] = useState(""); 
  
  const [signOffPhotoFiles, setSignOffPhotoFiles] = useState<File[]>([]);
  const [pmPhotoFiles, setPmPhotoFiles] = useState<File[]>([]);
  const [reportPhotoFiles, setReportPhotoFiles] = useState<File[]>([]);
  
  const [showPMModal, setShowPMModal] = useState(false);
  const [pmMachineId, setPmMachineId] = useState("");
  const [pmCategory, setPmCategory] = useState("mechanical");
  const [pmDescription, setPmDescription] = useState("");
  const [pmSupervisorName, setPmSupervisorName] = useState("");
  const [pmTechnicianName, setPmTechnicianName] = useState("");
  const [pmOperatorName, setPmOperatorName] = useState("");
  
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportMachineId, setReportMachineId] = useState(""); 
  const [reportCategory, setReportCategory] = useState("mechanical");
  const [reportDescription, setReportDescription] = useState("");
  
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [inspectionMachineId, setInspectionMachineId] = useState("");
  const [inspectionEngineerType, setInspectionEngineerType] = useState("internal");
  const [inspectionEngineerName, setInspectionEngineerName] = useState("");
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [inspectionFile, setInspectionFile] = useState<File | null>(null);

  const [breakdownHistory, setBreakdownHistory] = useState<any[]>([]);
  const [pmHistory, setPmHistory] = useState<any[]>([]);
  const filteredMachines = machines;
  
  const openMachineDetails = (machine: any) => {};
  const handleCloseDetails = () => {};
  const handleResolveSubmit = (e: any) => {};
  const handleFaultSubmit = (e: any) => {};
  const handlePMSubmit = (e: any) => {};
  const handleUpdateQuantity = (id: number, delta: number, actionType: string) => {};
  const handleAddPart = (e: any) => {};

  const [isListening, setIsListening] = useState(false);
  const [listeningField, setListeningField] = useState<any>(null);
  const [transcript, setTranscript] = useState("");
  const [browserSupportsSpeech, setBrowserSupportsSpeech] = useState(false);
  const recognitionRef = useRef<any>(null);

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://168.144.81.103:5000";
  const frontendUrl = typeof window !== "undefined" ? window.location.origin : "http://168.144.81.103:3000";

  useEffect(() => {
    if (typeof window !== "undefined" && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'hi-IN'; 
      recognitionRef.current.onresult = (event: any) => {
        const current = event.resultIndex;
        const newTranscript = event.results[current][0].transcript;
        setTranscript(newTranscript);
      };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
      setBrowserSupportsSpeech(true);
    }
  }, []);

  useEffect(() => {
    if (transcript) {
      if (listeningField === 'pm') setPmDescription(p => p + (p ? " " : "") + transcript);
      else if (listeningField === 'report') setReportDescription(p => p + (p ? " " : "") + transcript);
      else if (listeningField === 'inspection') setInspectionNotes(p => p + (p ? " " : "") + transcript);
      else if (listeningField === 'resolve') setResolutionNotes(p => p + (p ? " " : "") + transcript);
      setTranscript(""); 
    }
  }, [transcript, listeningField]);

  const toggleListen = (field: "pm" | "report" | "inspection" | "resolve") => {
    if (isListening && listeningField === field) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setListeningField(null);
    } else {
      if (isListening) recognitionRef.current?.stop();
      setListeningField(field);
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) { console.error(e); }
    }
  };

  const stopListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setListeningField(null);
    }
  };

  const fetchData = async () => {
    try {
      const [ordersRes, machinesRes] = await Promise.all([
        fetch(`${baseUrl}/api/work-orders`),
        fetch(`${baseUrl}/api/machines`)
      ]);
      if (!ordersRes.ok || !machinesRes.ok) throw new Error("Failed to fetch data");
      
      const ordersData = await ordersRes.json();
      const machinesData = await machinesRes.json();
      
      setWorkOrders(ordersData);
      setMachines(machinesData);
      
      if (machinesData.length > 0) {
        setReportMachineId(machinesData[0].id.toString());
        setPmMachineId(machinesData[0].id.toString());
        setInspectionMachineId(machinesData[0].id.toString());
      }
    } catch (err: any) {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleReportPM = async (e: React.FormEvent) => {
    e.preventDefault();
    stopListening();
    setIsSubmitting(true);
    try {
      if (!pmMachineId || pmMachineId === "undefined" || pmMachineId === "") {
        alert("⚠️ Please select a valid machine from the dropdown first!");
        setIsSubmitting(false);
        return;
      }
      const formData = new FormData();
      formData.append("machine_id", pmMachineId);
      formData.append("task_category", pmCategory);
      formData.append("description", pmDescription);
      formData.append("supervisor_name", pmSupervisorName);
      formData.append("technician_name", pmTechnicianName);
      formData.append("operator_name", pmOperatorName);
      
      pmPhotoFiles.forEach((file) => formData.append("photos", file));
      
      const res = await fetch(`${baseUrl}/api/work-orders/preventive`, {
        method: "POST",
        body: formData
      });
      
      if (!res.ok) throw new Error("Server error");
      
      setShowPMModal(false);
      setPmDescription("");
      setPmSupervisorName("");
      setPmTechnicianName("");
      setPmOperatorName("");
      setPmPhotoFiles([]);
      fetchData();
      alert("✅ PM Logged Successfully");
    } catch (err) {
      alert("Error logging PM.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteTask = async () => {
    if (!selectedOrder) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${baseUrl}/api/work-orders/${selectedOrder.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          supervisor_name: supervisorName, 
          technician_name: technicianName, 
          operator_name: operatorName,
          resolution_notes: resolutionNotes 
        })
      });
      if (!res.ok) throw new Error("Failed");
      
      if (signOffPhotoFiles.length > 0) {
        const formData = new FormData();
        signOffPhotoFiles.forEach((file) => formData.append("photos", file));
        await fetch(`${baseUrl}/api/work-orders/${selectedOrder.id}/photos`, { method: "POST", body: formData });
      }
      
      alert("✅ Work order signed off successfully!");
      setSelectedOrder(null); 
      setSupervisorName("");
      setTechnicianName("");
      setOperatorName("");
      setResolutionNotes("");
      setSignOffPhotoFiles([]);
      fetchData(); 
    } catch (err) {
      alert("Error submitting task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReportBreakdown = async (e: React.FormEvent) => {
    e.preventDefault();
    stopListening();
    setIsSubmitting(true);
    try {
      if (!reportMachineId || reportMachineId === "undefined" || reportMachineId === "") {
        alert("⚠️ Please select a valid machine from the dropdown first!");
        setIsSubmitting(false);
        return;
      }
      const formData = new FormData();
      formData.append("machine_id", reportMachineId);
      formData.append("task_category", reportCategory);
      formData.append("description", reportDescription);
      reportPhotoFiles.forEach((file) => formData.append("photos", file));
      
      const res = await fetch(`${baseUrl}/api/work-orders/report`, {
        method: "POST",
        body: formData
      });
      
      if (!res.ok) throw new Error("Failed");
      
      setShowReportModal(false);
      setReportDescription("");
      setReportPhotoFiles([]);
      fetchData(); 
      alert("🚨 Breakdown reported!");
    } catch (err) {
      alert("Error reporting breakdown.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    stopListening();
    setIsSubmitting(true);
    try {
      if (!inspectionMachineId || inspectionMachineId === "undefined" || inspectionMachineId === "") {
        alert("⚠️ Please select a valid machine from the dropdown first!");
        setIsSubmitting(false);
        return;
      }
      const formData = new FormData();
      formData.append("machine_id", inspectionMachineId);
      formData.append("engineer_type", inspectionEngineerType);
      formData.append("engineer_name", inspectionEngineerName);
      formData.append("notes", inspectionNotes);
      if (inspectionFile) formData.append("file", inspectionFile);
      
      const res = await fetch(`${baseUrl}/api/reports`, {
        method: "POST",
        body: formData
      });
      
      if (!res.ok) throw new Error("Failed");
      
      setShowInspectionModal(false);
      setInspectionEngineerName("");
      setInspectionNotes("");
      setInspectionFile(null);
      alert("📋 Inspection Report Uploaded Successfully!");
    } catch (err) {
      alert("Error uploading report.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const breakdownOrders = workOrders.filter(o => o.schedule_type === 'breakdown_report');
  const pmOrders = workOrders.filter(o => o.schedule_type !== 'breakdown_report');

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4"><p className="text-sm text-zinc-400 font-medium tracking-widest uppercase animate-pulse">Loading System / सिस्टम लोड हो रहा है...</p></div>;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <header className="bg-zinc-900/50 border border-zinc-800/80 rounded-3xl p-5 sm:p-8 backdrop-blur-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <Link href="/" className="text-zinc-400 hover:text-white text-xs font-medium uppercase tracking-wider mb-4 flex items-center gap-2 transition-colors">
              <span>←</span> Dashboard Return
            </Link>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">Asset Registry</h1>
            <p className="text-zinc-500 text-sm mt-1">मशीन डायरेक्टरी</p>
          </div>
          {!selectedMachine && (
            <div className="relative w-full md:w-80 shrink-0">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl opacity-50">🔍</span>
              <input 
                type="text" 
                placeholder="Search name or asset tag..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-zinc-600"
              />
            </div>
          )}
        </header>

        {!selectedMachine ? (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {filteredMachines.length > 0 ? (
              filteredMachines.map((machine) => (
                <div 
                  key={machine.id} 
                  onClick={() => openMachineDetails(machine)}
                  className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 flex flex-col hover:bg-zinc-900/80 hover:border-zinc-700 transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-medium tracking-wide uppercase border ${machine.status === 'breakdown' ? 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                      {machine.status === 'breakdown' ? 'Offline' : 'Operational'}
                    </span>
                    <span className="text-zinc-500 text-xs font-mono">{machine.asset_tag}</span>
                  </div>
                  <h2 className="text-lg font-bold text-zinc-100 mb-4 flex items-center gap-2">
                    <strong>{String(machine.id).padStart(3, '0')}</strong> - {machine.name}
                  </h2>
                  <div className="mt-auto pt-4 border-t border-zinc-800/50 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Next PM</p>
                      <p className="text-zinc-300 text-xs">{machine.next_maintenance}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors">
                      →
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-20 text-center text-zinc-500">
                No machines found matching "{searchTerm}"
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-4">
                <button onClick={handleCloseDetails} className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium px-4 py-2.5 rounded-xl transition-all text-sm flex items-center gap-2">
                  <span>←</span> Back to Grid
                </button>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <strong>{String(selectedMachine.id).padStart(3, '0')}</strong> - {selectedMachine.name}
                  <span className="text-zinc-500 font-mono text-sm ml-2">{selectedMachine.asset_tag}</span>
                </h2>
              </div>
              <div className="bg-white p-2 rounded-xl flex items-center gap-4 border border-zinc-800/50 shrink-0">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=${encodeURIComponent(`${frontendUrl}/m.html?id=${selectedMachine.id}`)}`} 
                  alt="QR Code" 
                  className="rounded-lg w-[70px] h-[70px]"
                />
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              {activeView === "home" && (
                <div className="space-y-4">
                  {selectedMachine.status === 'breakdown' ? (
                    <button 
                      onClick={() => setActiveView("resolve")}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-5 rounded-xl shadow-lg border border-emerald-500 transition-all active:scale-95 flex flex-col items-center justify-center gap-2"
                    >
                      <span className="text-2xl">✅</span>
                      <span className="text-xl tracking-wide">RESOLVE BREAKDOWN</span>
                      <span className="text-sm font-medium opacity-80">खराबी ठीक करें</span>
                    </button>
                  ) : (
                    <button 
                      onClick={() => setActiveView("fault")}
                      className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-5 rounded-xl shadow-lg border border-red-500 transition-all active:scale-95 flex flex-col items-center justify-center gap-2"
                    >
                      <span className="text-2xl">🚨</span>
                      <span className="text-xl tracking-wide">REPORT BREAKDOWN</span>
                      <span className="text-sm font-medium opacity-80">मशीन की खराबी दर्ज करें</span>
                    </button>
                  )}
                  <button 
                    onClick={() => setActiveView("pm")}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-5 rounded-xl shadow-lg border border-amber-500 transition-all active:scale-95 flex flex-col items-center justify-center gap-2"
                  >
                    <span className="text-2xl">🛠️</span>
                    <span className="text-xl tracking-wide">LOG SERVICE (PM)</span>
                    <span className="text-sm font-medium opacity-80">मशीन सर्विस दर्ज करें</span>
                  </button>
                </div>
              )}

              {activeView === "resolve" && (
                <form onSubmit={handleResolveSubmit} className="space-y-6">
                  <h2 className="text-emerald-400 font-bold mb-4 flex items-center gap-2 text-xl">✅ Resolve Issue</h2>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Technician Name</label>
                    <input type="text" required value={supervisor} onChange={(e) => setSupervisor(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:border-emerald-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Resolution Notes</label>
                    <textarea required rows={4} value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:border-emerald-500 outline-none" placeholder="How did you fix it?"></textarea>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setActiveView("home")} className="flex-1 bg-zinc-800 text-white py-4 rounded-lg font-bold">CANCEL</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 bg-emerald-600 text-white py-4 rounded-lg font-bold disabled:opacity-50">{isSubmitting ? "SAVING..." : "COMPLETE"}</button>
                  </div>
                </form>
              )}

              {activeView === "fault" && (
                <form onSubmit={handleFaultSubmit} className="space-y-6">
                  <h2 className="text-red-400 font-bold mb-4 flex items-center gap-2 text-xl">🚨 Report Breakdown</h2>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Category</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:border-red-500 outline-none">
                      <option value="mechanical">Mechanical</option>
                      <option value="electrical">Electrical</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Issue Details</label>
                    <textarea required rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:border-red-500 outline-none" placeholder="Describe the problem..."></textarea>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setActiveView("home")} className="flex-1 bg-zinc-800 text-white py-4 rounded-lg font-bold">CANCEL</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 bg-red-600 text-white py-4 rounded-lg font-bold disabled:opacity-50">{isSubmitting ? "SENDING..." : "SUBMIT FAULT"}</button>
                  </div>
                </form>
              )}

              {activeView === "pm" && (
                <form onSubmit={handlePMSubmit} className="space-y-6">
                  <h2 className="text-amber-400 font-bold mb-4 flex items-center gap-2 text-xl">🛠️ Log Service</h2>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Service Type</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:border-amber-500 outline-none">
                      <option value="mechanical">Mechanical</option>
                      <option value="electrical">Electrical</option>
                      <option value="cleaning">Cleaning</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Technician Name</label>
                    <input type="text" required value={supervisor} onChange={(e) => setSupervisor(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:border-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Service Notes</label>
                    <textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:border-amber-500 outline-none" placeholder="What was done?"></textarea>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setActiveView("home")} className="flex-1 bg-zinc-800 text-white py-4 rounded-lg font-bold">CANCEL</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 bg-amber-600 text-white py-4 rounded-lg font-bold disabled:opacity-50">{isSubmitting ? "SAVING..." : "LOG SERVICE"}</button>
                  </div>
                </form>
              )}
            </div>

            <div className="flex border-b border-zinc-800 overflow-x-auto mt-8">
              <button onClick={() => setActiveTab("breakdowns")} className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "breakdowns" ? "border-red-500 text-red-400" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}>
                🚨 Breakdowns
              </button>
              <button onClick={() => setActiveTab("pms")} className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "pms" ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}>
                🛠️ PM Logs
              </button>
              <button onClick={() => setActiveTab("reports")} className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "reports" ? "border-blue-500 text-blue-400" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}>
                📋 Reports
              </button>
              <button onClick={() => setActiveTab("inventory")} className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "inventory" ? "border-emerald-500 text-emerald-400" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}>
                📦 Parts
              </button>
            </div>

            {isPanelLoading ? (
              <div className="py-20 text-center text-zinc-500 text-sm animate-pulse">Loading data...</div>
            ) : (
              <div className="min-h-[400px]">
                
                {activeTab === "breakdowns" && (
                  <div className="space-y-4">
                    {breakdownHistory.length > 0 ? breakdownHistory.map((log) => (
                      <div key={log.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row gap-6">
                        <div className="sm:w-1/4 shrink-0">
                          <span className="inline-block px-2.5 py-1 rounded-md text-[10px] font-medium tracking-wide uppercase mb-3 bg-red-500/10 text-red-400">
                            BREAKDOWN
                          </span>
                          <p className="text-zinc-500 text-xs mb-1">Resolved On</p>
                          <p className="text-zinc-200 text-sm mb-4">{new Date(log.completed_at).toLocaleDateString()}</p>
                          <p className="text-zinc-500 text-xs mb-1">Downtime</p>
                          <p className="text-zinc-200 text-sm">{log.time_taken_hours} Hrs</p>
                        </div>
                        <div className="flex-grow border-t sm:border-t-0 sm:border-l border-zinc-800 pt-4 sm:pt-0 sm:pl-6">
                          <p className="text-zinc-400 text-[10px] uppercase tracking-wider mb-2">Technician</p>
                          <p className="text-zinc-100 font-medium mb-4">{log.technician}</p>
                          <p className="text-zinc-400 text-[10px] uppercase tracking-wider mb-2">Report & Resolution Notes</p>
                          <div className="bg-zinc-950 border border-zinc-800/50 rounded-xl p-4 text-sm text-zinc-300 leading-relaxed mb-4 whitespace-pre-wrap">
                            {log.description || "No notes provided."}
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-12 border border-dashed border-zinc-800 rounded-3xl text-zinc-500 text-sm">No breakdown history found.</div>
                    )}
                  </div>
                )}

                {activeTab === "pms" && (
                  <div className="space-y-4">
                    {pmHistory.length > 0 ? pmHistory.map((log) => (
                      <div key={log.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row gap-6">
                        <div className="sm:w-1/4 shrink-0">
                          <span className="inline-block px-2.5 py-1 rounded-md text-[10px] font-medium tracking-wide uppercase mb-3 bg-amber-500/10 text-amber-400">
                            PREVENTIVE
                          </span>
                          <p className="text-zinc-500 text-xs mb-1">Completed On</p>
                          <p className="text-zinc-200 text-sm mb-4">{new Date(log.completed_at).toLocaleDateString()}</p>
                          <p className="text-zinc-500 text-xs mb-1">Time Taken</p>
                          <p className="text-zinc-200 text-sm">{log.time_taken_hours} Hrs</p>
                        </div>
                        <div className="flex-grow border-t sm:border-t-0 sm:border-l border-zinc-800 pt-4 sm:pt-0 sm:pl-6">
                          <p className="text-zinc-400 text-[10px] uppercase tracking-wider mb-2">Technician</p>
                          <p className="text-zinc-100 font-medium mb-4">{log.technician}</p>
                          <p className="text-zinc-400 text-[10px] uppercase tracking-wider mb-2">Service Notes</p>
                          <div className="bg-zinc-950 border border-zinc-800/50 rounded-xl p-4 text-sm text-zinc-300 leading-relaxed mb-4">
                            {log.description || "No notes provided."}
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-12 border border-dashed border-zinc-800 rounded-3xl text-zinc-500 text-sm">No scheduled maintenance records found.</div>
                    )}
                  </div>
                )}

                {activeTab === "reports" && (
                  <div className="space-y-4">
                    {reports.length > 0 ? reports.map((report) => (
                      <div key={report.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row gap-6">
                        <div className="sm:w-1/4 shrink-0">
                          <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-medium tracking-wide uppercase mb-3 ${report.engineer_type === 'internal' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'}`}>
                            {report.engineer_type} Engineer
                          </span>
                          <p className="text-zinc-500 text-xs mb-1">Date Uploaded</p>
                          <p className="text-zinc-200 text-sm mb-4">{new Date(report.created_at).toLocaleDateString()}</p>
                          <p className="text-zinc-500 text-xs mb-1">Uploaded By</p>
                          <p className="text-zinc-200 text-sm font-medium">{report.engineer_name}</p>
                        </div>
                        <div className="flex-grow border-t sm:border-t-0 sm:border-l border-zinc-800 pt-4 sm:pt-0 sm:pl-6 flex flex-col">
                          <p className="text-zinc-400 text-[10px] uppercase tracking-wider mb-2">Inspection Notes</p>
                          <div className="bg-zinc-950 border border-zinc-800/50 rounded-xl p-4 text-sm text-zinc-300 leading-relaxed mb-4 flex-grow">
                            {report.notes || "No additional notes provided."}
                          </div>
                          {report.file_url && (
                            <a href={report.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 py-3 px-4 rounded-xl text-sm font-medium transition-colors w-full sm:w-max">
                              <span>📄</span> View Attached Document
                            </a>
                          )}
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-12 border border-dashed border-zinc-800 rounded-3xl text-zinc-500 text-sm">No inspection reports uploaded.</div>
                    )}
                  </div>
                )}

                {activeTab === "inventory" && (
                  <div>
                    <div className="flex justify-between items-center mb-6">
                      <p className="text-zinc-400 text-sm">Live spare parts inventory</p>
                      <button onClick={() => setShowAddPart(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors">
                        + Add Part
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {Array.isArray(parts) && parts.length > 0 ? (
                        parts.map((part) => (
                          <div key={part.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex gap-4 items-center hover:border-zinc-700 transition-colors">
                            <div className="h-20 w-20 shrink-0 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800/50 flex items-center justify-center relative">
                              {part.photo_url ? (
                                <img src={part.photo_url} alt={part.part_name} className="absolute inset-0 w-full h-full object-cover" />
                              ) : (
                                <span className="text-2xl opacity-20">⚙️</span>
                              )}
                            </div>
                            <div className="flex-grow min-w-0">
                              <h3 className="text-zinc-100 font-medium truncate">{part.part_name}</h3>
                              <p className="text-zinc-500 text-xs font-mono mb-3 truncate">{part.part_number || "No Part #"}</p>
                              <div className="flex items-center gap-3">
                                <button onClick={() => handleUpdateQuantity(part.id, part.quantity, -1)} className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center font-bold">-</button>
                                <span className={`text-base font-medium w-6 text-center ${part.quantity === 0 ? 'text-red-400' : 'text-white'}`}>{part.quantity}</span>
                                <button onClick={() => handleUpdateQuantity(part.id, part.quantity, 1)} className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center font-bold">+</button>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-full text-center py-12 border border-dashed border-zinc-800 rounded-3xl text-zinc-500 text-sm">
                          Inventory is empty.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ADD PART MODAL */}
      {showAddPart && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-3xl rounded-t-3xl p-6 sm:p-8 w-full max-w-md animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <h3 className="text-lg font-medium text-white mb-6">📦 Register New Spare Part</h3>
            <form onSubmit={handleAddPart} className="space-y-5">
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Part Name</label>
                <input type="text" required value={newPartName} onChange={(e) => setNewPartName(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 text-xs mb-2">Part No.</label>
                  <input type="text" value={newPartNumber} onChange={(e) => setNewPartNumber(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs mb-2">Stock</label>
                  <input type="number" required min="0" value={newPartQuantity} onChange={(e) => setNewPartQuantity(parseInt(e.target.value) || 0)} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm" />
                </div>
              </div>
              <div className="flex gap-3 pt-2 pb-4 sm:pb-0">
                <button type="button" onClick={() => setShowAddPart(false)} className="flex-1 bg-zinc-800 text-white rounded-xl p-3.5 text-sm font-medium hover:bg-zinc-700">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-emerald-600 text-white rounded-xl p-3.5 text-sm font-medium hover:bg-emerald-50 disabled:opacity-50">Save Part</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
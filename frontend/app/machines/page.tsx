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
  const [statusFilter, setStatusFilter] = useState("all");
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
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  
  const [resolveOrder, setResolveOrder] = useState<any>(null);
  const filteredMachines = machines.filter(m => {
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      m.name.toLowerCase().includes(term) ||
      (m.asset_tag && m.asset_tag.toLowerCase().includes(term)) ||
      m.id.toString().includes(term)
    );
  });
  
  const openMachineDetails = async (machine: any) => {
    setSelectedMachine(machine);
    setActiveView("home");
    // Fetch reports and breakdown/pm history specific to this machine
    try {
      const [historyRes, reportsRes, partsRes, activeRes] = await Promise.all([
        fetch(`${baseUrl}/api/machines/${machine.id}/history`),
        fetch(`${baseUrl}/api/machines/${machine.id}/reports`),
        fetch(`${baseUrl}/api/machines/${machine.id}/parts`),
        fetch(`${baseUrl}/api/machines/${machine.id}/active-orders`)
      ]);
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        // Filter history by schedule type
        setBreakdownHistory(historyData.filter((o: any) => o.schedule_type === 'breakdown_report'));
        setPmHistory(historyData.filter((o: any) => o.schedule_type !== 'breakdown_report'));
      }
      if (reportsRes.ok) {
        const reportsData = await reportsRes.json();
        setReports(reportsData);
      }
      if (partsRes.ok) {
        const partsData = await partsRes.json();
        setParts(partsData);
      }
      if (activeRes.ok) {
        const activeData = await activeRes.json();
        setActiveOrders(activeData);
      }
    } catch (e) {
      console.error("Failed to load machine details", e);
    }
  };
  const handleCloseDetails = () => {
    setSelectedMachine(null);
    setActiveOrders([]);
  };
  const handleResolveSubmit = (e: any) => {};
  const handleFaultSubmit = (e: any) => {};
  const handlePMSubmit = (e: any) => {};
  const handleUpdateQuantity = async (id: number, currentQty: number, delta: number) => {
    const newQty = Math.max(0, currentQty + delta);
    try {
      const res = await fetch(`${baseUrl}/api/parts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQty })
      });
      if (res.ok) {
        setParts(parts.map(p => p.id === id ? { ...p, quantity: newQty } : p));
      }
    } catch (e) { console.error(e); }
  };
  
  const handleAddPart = async (e: any) => {
    e.preventDefault();
    if (!selectedMachine) return;
    setIsSubmitting(true);
    
    const formData = new FormData();
    formData.append("part_name", newPartName);
    formData.append("part_number", newPartNumber);
    formData.append("quantity", newPartQuantity.toString());
    if (newPartPhoto) formData.append("file", newPartPhoto);

    try {
      const res = await fetch(`${baseUrl}/api/machines/${selectedMachine.id}/parts`, {
        method: "POST",
        body: formData
      });
      if (res.ok) {
        const newPart = await res.json();
        setParts([...parts, newPart]);
        setShowAddPart(false);
        setNewPartName("");
        setNewPartNumber("");
        setNewPartQuantity(1);
        setNewPartPhoto(null);
      } else {
        alert("Failed to add part");
      }
    } catch (e) {
      console.error(e);
      alert("Error adding part");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [isListening, setIsListening] = useState(false);
  const [listeningField, setListeningField] = useState<any>(null);
  const [transcript, setTranscript] = useState("");
  const [browserSupportsSpeech, setBrowserSupportsSpeech] = useState(false);
  const recognitionRef = useRef<any>(null);

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
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

  useEffect(() => {
    if (machines.length > 0 && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const machineIdStr = params.get("id");
      if (machineIdStr) {
        const id = parseInt(machineIdStr, 10);
        const machine = machines.find((m) => m.id === id);
        if (machine && !selectedMachine) {
          openMachineDetails(machine);
        }
      }
    }
  }, [machines]);

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

  if (loading) return <div className="min-h-screen bg-[#F9F9F7] border-2 border-[#111111] flex items-center justify-center p-4"><p className="text-sm text-[#525252] font-medium tracking-widest uppercase animate-pulse">Loading System / सिस्टम लोड हो रहा है...</p></div>;

  return (
    <main className="min-h-screen bg-[#F9F9F7] border-2 border-[#111111] text-[#111111] font-serif p-4 sm:p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <header className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover border border-[#111111] border rounded-none p-5 sm:p-8 backdrop-blur-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Prem Industries Logo" className="h-16 w-auto object-contain" />
            <div>
              <Link href="/" className="text-[#525252] hover:text-[#111111] text-xs font-medium uppercase tracking-wider mb-4 flex items-center gap-2 transition-colors">
                <span>←</span> Dashboard Return
              </Link>
              <h1 className="text-2xl sm:text-3xl font-semibold text-[#111111] tracking-tight">Asset Registry</h1>
              <p className="text-[#737373] text-sm mt-1">मशीन डायरेक्टरी</p>
            </div>
          </div>
          {!selectedMachine && (
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto shrink-0">
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-48 bg-[#F9F9F7] border-2 border-[#111111] text-[#111111] rounded-none py-4 px-4 outline-none focus:ring-2 focus:ring-gray-200/50 transition-all font-serif"
              >
                <option value="all">All Status</option>
                <option value="operational">Operational</option>
                <option value="breakdown">Offline</option>
              </select>
              <div className="relative w-full sm:w-80">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl opacity-50">🔍</span>
                <input 
                  type="text" 
                  placeholder="Search name or asset tag..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] text-[#111111] rounded-none py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-gray-200/50 transition-all placeholder:text-zinc-600"
                />
              </div>
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
                  className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover border border-[#111111] border rounded-none p-5 flex flex-col hover:bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover hover:border-[#111111] transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <span className={`px-2.5 py-1 rounded-none text-[10px] font-medium tracking-wide uppercase border ${machine.status === 'breakdown' ? 'bg-[#111111]/10 text-[#CC0000] border-[#111111]/20 animate-pulse' : 'bg-[#111111]/10 text-[#CC0000] border-[#111111]/20'}`}>
                      {machine.status === 'breakdown' ? 'Offline' : 'Operational'}
                    </span>
                    <span className="text-[#737373] text-xs font-mono">{machine.asset_tag}</span>
                  </div>
                  <h2 className="text-lg font-serif text-[#111111] font-serif mb-4 flex items-center gap-2">
                    <strong>{String(machine.id).padStart(3, '0')}</strong> - {machine.name}
                  </h2>
                  <div className="mt-auto pt-4 border-t border-[#111111] border/50 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] text-[#737373] uppercase tracking-widest">Next PM</p>
                      <p className="text-[#111111] text-xs">{machine.next_maintenance}</p>
                    </div>
                    <div className="w-8 h-8 rounded-none bg-[#111111] text-[#F9F9F7] flex items-center justify-center group-hover:bg-gray-200/20 group-hover:text-[#111111] transition-colors">
                      →
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-20 text-center text-[#737373]">
                No machines found matching "{searchTerm}"
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-4">
                <button onClick={handleCloseDetails} className="bg-[#111111] hover:bg-white text-[#F9F9F7] hover:text-[#111111] border-2 border-[#111111] font-medium px-4 py-2.5 rounded-none transition-all text-sm flex items-center gap-2">
                  <span>←</span> Back to Grid
                </button>
                <h2 className="text-xl font-serif text-[#111111] flex items-center gap-2">
                  <strong>{String(selectedMachine.id).padStart(3, '0')}</strong> - {selectedMachine.name}
                  <span className="text-[#737373] font-mono text-sm ml-2">{selectedMachine.asset_tag}</span>
                </h2>
              </div>
              <div className="bg-white p-2 rounded-none flex items-center gap-4 border border-[#111111] border/50 shrink-0">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=${encodeURIComponent(`${frontendUrl}/machines?id=${selectedMachine.id}`)}`} 
                  alt="QR Code" 
                  className="rounded-none w-[70px] h-[70px]"
                />
              </div>
            </div>

            <div className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover border border-[#111111] border rounded-none p-6">
              {activeView === "home" && (
                <div className="space-y-4">
                  {selectedMachine.status === 'breakdown' ? (
                    <button 
                      onClick={() => setActiveView("resolve")}
                      className="w-full bg-[#111111] text-[#F9F9F7] hover:bg-emerald-600 border-2 border-[#111111] hard-shadow-hover font-serif py-5 rounded-none transition-all active:scale-95 flex flex-col items-center justify-center gap-2"
                    >
                      <span className="text-2xl">✅</span>
                      <span className="text-xl tracking-widest">RESOLVE BREAKDOWN</span>
                      <span className="text-sm font-medium opacity-80">खराबी ठीक करें</span>
                    </button>
                  ) : (
                    <button 
                      onClick={() => setActiveView("fault")}
                      className="w-full bg-[#111111] text-[#F9F9F7] hover:bg-[#CC0000] border-2 border-[#111111] hard-shadow-hover font-serif py-5 rounded-none transition-all active:scale-95 flex flex-col items-center justify-center gap-2"
                    >
                      <span className="text-2xl">🚨</span>
                      <span className="text-xl tracking-widest">REPORT BREAKDOWN</span>
                      <span className="text-sm font-medium opacity-80">मशीन की खराबी दर्ज करें</span>
                    </button>
                  )}
                  <button 
                    onClick={() => setActiveView("pm")}
                    className="w-full bg-[#111111] text-[#F9F9F7] hover:bg-amber-600 border-2 border-[#111111] hard-shadow-hover font-serif py-5 rounded-none transition-all active:scale-95 flex flex-col items-center justify-center gap-2"
                  >
                    <span className="text-2xl">🛠️</span>
                    <span className="text-xl tracking-widest">LOG SERVICE (PM)</span>
                    <span className="text-sm font-medium opacity-80">मशीन सर्विस दर्ज करें</span>
                  </button>
                </div>
              )}

              {activeView === "home" && activeOrders.filter((o) => o.schedule_type === "predictive_alert").map((alertOrder) => (
                <div key={alertOrder.id} className="mt-4 bg-emerald-50 border-2 border-emerald-500 p-4 rounded-none">
                  <h3 className="text-emerald-900 font-bold mb-2">🚨 PREDICTIVE ALERT ACTIVE</h3>
                  <p className="text-emerald-800 text-sm mb-4">{alertOrder.description}</p>
                  <button 
                    onClick={() => {
                      setResolveOrder(alertOrder);
                      setActiveView("resolve_predictive");
                    }}
                    className="w-full bg-emerald-900 text-white py-3 font-serif hover:bg-emerald-800 transition-colors"
                  >
                    RESOLVE PREDICTIVE ALERT
                  </button>
                </div>
              ))}

              {activeView === "resolve" && (
                <form onSubmit={handleResolveSubmit} className="space-y-6">
                  <h2 className="text-[#CC0000] font-serif mb-4 flex items-center gap-2 text-xl">✅ Resolve Issue</h2>
                  <div>
                    <label className="block text-[#525252] text-sm mb-1">Technician Name</label>
                    <input type="text" required value={supervisor} onChange={(e) => setSupervisor(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border rounded-none p-3 text-[#111111] focus:border-emerald-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[#525252] text-sm mb-1">Resolution Notes</label>
                    <textarea required rows={4} value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border rounded-none p-3 text-[#111111] focus:border-emerald-500 outline-none" placeholder="How did you fix it?"></textarea>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setActiveView("home")} className="flex-1 bg-[#111111] text-[#111111] py-4 rounded-none font-serif">CANCEL</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 bg-[#111111] text-[#F9F9F7] hover:bg-white hover:text-[#111111] hover:border-[#111111] border border-transparent font-serif tracking-widest text-[#111111] py-4 rounded-none font-serif disabled:opacity-50">{isSubmitting ? "SAVING..." : "COMPLETE"}</button>
                  </div>
                </form>
              )}

              {activeView === "resolve_predictive" && (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setIsSubmitting(true);
                  try {
                    const formData = new FormData();
                    formData.append("supervisor", supervisor);
                    formData.append("technician", inspectionEngineerName); 
                    formData.append("notes", resolutionNotes);
                    formData.append("status", "completed");
                    reportPhotoFiles.forEach((file) => formData.append("photos", file));
                    
                    const res = await fetch(`${baseUrl}/api/work-orders/${resolveOrder.id}/complete`, {
                      method: "POST",
                      body: formData
                    });
                    if (res.ok) {
                      alert("Alert resolved!");
                      setActiveView("home");
                      openMachineDetails(selectedMachine);
                    }
                  } finally {
                    setIsSubmitting(false);
                  }
                }} className="space-y-6">
                  <h2 className="text-emerald-700 font-serif mb-4 flex items-center gap-2 text-xl">✅ Resolve Predictive Alert</h2>
                  <div>
                    <label className="block text-[#525252] text-sm mb-1">Supervisor Name</label>
                    <input type="text" required value={supervisor} onChange={(e) => setSupervisor(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] p-3 text-[#111111] outline-none" />
                  </div>
                  <div>
                    <label className="block text-[#525252] text-sm mb-1">Technician Name</label>
                    <input type="text" required value={inspectionEngineerName} onChange={(e) => setInspectionEngineerName(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] p-3 text-[#111111] outline-none" />
                  </div>
                  <div>
                    <label className="block text-[#525252] text-sm mb-1">Resolution Notes / Description</label>
                    <textarea required rows={4} value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] p-3 text-[#111111] outline-none"></textarea>
                  </div>
                  <div>
                    <label className="block text-[#525252] text-sm mb-1">Upload Photos</label>
                    <div className="relative border-2 border-dashed border-[#111111] p-4 text-center bg-[#F9F9F7]">
                      <input type="file" multiple accept="image/*" onChange={(e) => {
                        setReportPhotoFiles(Array.from(e.target.files || []));
                      }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      {reportPhotoFiles.length > 0 ? <span className="text-[#111111] text-xs">📸 {reportPhotoFiles.length} photo(s) selected</span> : <span className="text-[#111111] text-xs">📸 Tap to Upload Photos</span>}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setActiveView("home")} className="flex-1 border-2 border-[#111111] py-4 rounded-none font-serif">CANCEL</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 bg-emerald-900 text-white py-4 rounded-none font-serif disabled:opacity-50">{isSubmitting ? "SAVING..." : "COMPLETE"}</button>
                  </div>
                </form>
              )}

              {activeView === "fault" && (
                <form onSubmit={handleFaultSubmit} className="space-y-6">
                  <h2 className="text-[#CC0000] font-serif mb-4 flex items-center gap-2 text-xl">🚨 Report Breakdown</h2>
                  <div>
                    <label className="block text-[#525252] text-sm mb-1">Category</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border rounded-none p-3 text-[#111111] focus:border-red-500 outline-none">
                      <option value="mechanical">Mechanical</option>
                      <option value="electrical">Electrical</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[#525252] text-sm mb-1">Issue Details</label>
                    <textarea required rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border rounded-none p-3 text-[#111111] focus:border-red-500 outline-none" placeholder="Describe the problem..."></textarea>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setActiveView("home")} className="flex-1 bg-[#111111] text-[#111111] py-4 rounded-none font-serif">CANCEL</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 bg-[#111111] text-[#F9F9F7] hover:bg-white hover:text-[#111111] hover:border-[#111111] border border-transparent font-serif tracking-[0.1em] border-2 border-[#111111] hard-shadow-hover text-[#111111] py-4 rounded-none font-serif disabled:opacity-50">{isSubmitting ? "SENDING..." : "SUBMIT FAULT"}</button>
                  </div>
                </form>
              )}

              {activeView === "pm" && (
                <form onSubmit={handlePMSubmit} className="space-y-6">
                  <h2 className="text-[#CC0000] font-serif mb-4 flex items-center gap-2 text-xl">🛠️ Log Service</h2>
                  <div>
                    <label className="block text-[#525252] text-sm mb-1">Service Type</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border rounded-none p-3 text-[#111111] focus:border-amber-500 outline-none">
                      <option value="mechanical">Mechanical</option>
                      <option value="electrical">Electrical</option>
                      <option value="cleaning">Cleaning</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[#525252] text-sm mb-1">Technician Name</label>
                    <input type="text" required value={supervisor} onChange={(e) => setSupervisor(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border rounded-none p-3 text-[#111111] focus:border-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[#525252] text-sm mb-1">Service Notes</label>
                    <textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border rounded-none p-3 text-[#111111] focus:border-amber-500 outline-none" placeholder="What was done?"></textarea>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setActiveView("home")} className="flex-1 bg-[#111111] text-[#111111] py-4 rounded-none font-serif">CANCEL</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 bg-[#111111] text-[#111111] font-serif tracking-[0.1em] border-2 border-[#1E3D59] hard-shadow-hover text-[#111111] py-4 rounded-none font-serif disabled:opacity-50">{isSubmitting ? "SAVING..." : "LOG SERVICE"}</button>
                  </div>
                </form>
              )}
            </div>

            <div className="flex border-b border-[#111111] border overflow-x-auto mt-8">
              <button onClick={() => setActiveTab("breakdowns")} className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "breakdowns" ? "border-red-500 text-[#CC0000]" : "border-transparent text-[#525252] hover:text-[#111111]"}`}>
                🚨 Breakdowns
              </button>
              <button onClick={() => setActiveTab("pms")} className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "pms" ? "border-amber-500 text-[#CC0000]" : "border-transparent text-[#525252] hover:text-[#111111]"}`}>
                🛠️ PM Logs
              </button>
              <button onClick={() => setActiveTab("reports")} className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "reports" ? "border-gray-200 text-blue-400" : "border-transparent text-[#525252] hover:text-[#111111]"}`}>
                📋 Reports
              </button>
              <button onClick={() => setActiveTab("inventory")} className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "inventory" ? "border-emerald-500 text-[#CC0000]" : "border-transparent text-[#525252] hover:text-[#111111]"}`}>
                📦 Parts
              </button>
            </div>

            {isPanelLoading ? (
              <div className="py-20 text-center text-[#737373] text-sm animate-pulse">Loading data...</div>
            ) : (
              <div className="min-h-[400px]">
                
                {activeTab === "breakdowns" && (
                  <div className="space-y-4">
                    {breakdownHistory.length > 0 ? breakdownHistory.map((log) => (
                      <div key={log.id} className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover border border-[#111111] border rounded-none p-5 sm:p-6 flex flex-col sm:flex-row gap-6">
                        <div className="sm:w-1/4 shrink-0">
                          <span className="inline-block px-2.5 py-1 rounded-none text-[10px] font-medium tracking-wide uppercase mb-3 bg-[#111111]/10 text-[#CC0000]">
                            BREAKDOWN
                          </span>
                          <p className="text-[#737373] text-xs mb-1">Resolved On</p>
                          <p className="text-[#111111] text-sm mb-4">{new Date(log.completed_at).toLocaleDateString()}</p>
                          <p className="text-[#737373] text-xs mb-1">Downtime</p>
                          <p className="text-[#111111] text-sm">{log.time_taken_hours} Hrs</p>
                        </div>
                        <div className="flex-grow border-t sm:border-t-0 sm:border-l border-[#111111] border pt-4 sm:pt-0 sm:pl-6">
                          <p className="text-[#525252] text-[10px] uppercase tracking-wider mb-2">Technician</p>
                          <p className="text-[#111111] font-serif font-medium mb-4">{log.technician}</p>
                          <p className="text-[#525252] text-[10px] uppercase tracking-wider mb-2">Report & Resolution Notes</p>
                          <div className="bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border/50 rounded-none p-4 text-sm text-[#111111] leading-relaxed mb-4 whitespace-pre-wrap">
                            {log.description || "No notes provided."}
                          </div>
                          {log.photos && log.photos.length > 0 && (
                            <div className="mt-4">
                              <p className="text-[#525252] text-[10px] uppercase tracking-wider mb-2">Attached Photos</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {log.photos.map((photo: string, idx: number) => (
                                  <a key={idx} href={photo.startsWith('http') ? photo : `${baseUrl}${photo}`} target="_blank" rel="noopener noreferrer">
                                    <img src={photo.startsWith('http') ? photo : `${baseUrl}${photo}`} alt="Record" className="w-full h-24 object-cover border border-[#111111]" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-12 border border-dashed border-[#111111] border rounded-none text-[#737373] text-sm">No breakdown history found.</div>
                    )}
                  </div>
                )}

                {activeTab === "pms" && (
                  <div className="space-y-4">
                    {pmHistory.length > 0 ? pmHistory.map((log) => (
                      <div key={log.id} className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover border border-[#111111] border rounded-none p-5 sm:p-6 flex flex-col sm:flex-row gap-6">
                        <div className="sm:w-1/4 shrink-0">
                          <span className="inline-block px-2.5 py-1 rounded-none text-[10px] font-medium tracking-wide uppercase mb-3 bg-[#111111]/20 border-2 border-purple-500 text-[#CC0000]">
                            PREVENTIVE
                          </span>
                          <p className="text-[#737373] text-xs mb-1">Completed On</p>
                          <p className="text-[#111111] text-sm mb-4">{new Date(log.completed_at).toLocaleDateString()}</p>
                          <p className="text-[#737373] text-xs mb-1">Time Taken</p>
                          <p className="text-[#111111] text-sm">{log.time_taken_hours} Hrs</p>
                        </div>
                        <div className="flex-grow border-t sm:border-t-0 sm:border-l border-[#111111] border pt-4 sm:pt-0 sm:pl-6">
                          <p className="text-[#525252] text-[10px] uppercase tracking-wider mb-2">Technician</p>
                          <p className="text-[#111111] font-serif font-medium mb-4">{log.technician}</p>
                          <p className="text-[#525252] text-[10px] uppercase tracking-wider mb-2">Service Notes</p>
                          <div className="bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border/50 rounded-none p-4 text-sm text-[#111111] leading-relaxed mb-4">
                            {log.description || "No notes provided."}
                          </div>
                          {log.photos && log.photos.length > 0 && (
                            <div className="mt-4">
                              <p className="text-[#525252] text-[10px] uppercase tracking-wider mb-2">Attached Photos</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {log.photos.map((photo: string, idx: number) => (
                                  <a key={idx} href={photo.startsWith('http') ? photo : `${baseUrl}${photo}`} target="_blank" rel="noopener noreferrer">
                                    <img src={photo.startsWith('http') ? photo : `${baseUrl}${photo}`} alt="Record" className="w-full h-24 object-cover border border-[#111111]" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-12 border border-dashed border-[#111111] border rounded-none text-[#737373] text-sm">No scheduled maintenance records found.</div>
                    )}
                  </div>
                )}

                {activeTab === "reports" && (
                  <div className="space-y-4">
                    {reports.length > 0 ? reports.map((report) => (
                      <div key={report.id} className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover border border-[#111111] border rounded-none p-5 sm:p-6 flex flex-col sm:flex-row gap-6">
                        <div className="sm:w-1/4 shrink-0">
                          <span className={`inline-block px-2.5 py-1 rounded-none text-[10px] font-medium tracking-wide uppercase mb-3 ${report.engineer_type === 'internal' ? 'bg-gray-200/10 text-blue-400 border border-gray-200/20' : 'bg-[#111111]/20 text-[#CC0000] border border-purple-500/20'}`}>
                            {report.engineer_type} Engineer
                          </span>
                          <p className="text-[#737373] text-xs mb-1">Date Uploaded</p>
                          <p className="text-[#111111] text-sm mb-4">{new Date(report.created_at).toLocaleDateString()}</p>
                          <p className="text-[#737373] text-xs mb-1">Uploaded By</p>
                          <p className="text-[#111111] text-sm font-medium">{report.engineer_name}</p>
                        </div>
                        <div className="flex-grow border-t sm:border-t-0 sm:border-l border-[#111111] border pt-4 sm:pt-0 sm:pl-6 flex flex-col">
                          <p className="text-[#525252] text-[10px] uppercase tracking-wider mb-2">Inspection Notes</p>
                          <div className="bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border/50 rounded-none p-4 text-sm text-[#111111] leading-relaxed mb-4 flex-grow">
                            {report.notes || "No additional notes provided."}
                          </div>
                          {report.file_url && (
                            <a href={`${baseUrl}${report.file_url}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 bg-white text-black border-2 border-[#111111] hover:bg-[#111111] hover:text-[#F9F9F7] py-3 px-4 rounded-none text-sm font-medium transition-colors w-full sm:w-max">
                              <span>📄</span> View Attached Document
                            </a>
                          )}
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-12 border border-dashed border-[#111111] border rounded-none text-[#737373] text-sm">No inspection reports uploaded.</div>
                    )}
                  </div>
                )}

                {activeTab === "inventory" && (
                  <div>
                    <div className="flex justify-between items-center mb-6">
                      <p className="text-[#525252] text-sm">Live spare parts inventory</p>
                      <button onClick={() => setShowAddPart(true)} className="bg-[#111111] text-[#F9F9F7] hover:bg-white hover:text-[#111111] hover:border-[#111111] border border-transparent font-serif tracking-widest hover:bg-emerald-500 text-[#111111] font-medium px-4 py-2 rounded-none text-sm transition-colors">
                        + Add Part
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {Array.isArray(parts) && parts.length > 0 ? (
                        parts.map((part) => (
                          <div key={part.id} className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover border border-[#111111] border rounded-none p-4 flex gap-4 items-center hover:border-[#111111] transition-colors">
                            <div className="h-20 w-20 shrink-0 bg-[#F9F9F7] border-2 border-[#111111] rounded-none overflow-hidden border border-[#111111] border/50 flex items-center justify-center relative">
                              {part.photo_url ? (
                                <img src={part.photo_url} alt={part.part_name} className="absolute inset-0 w-full h-full object-cover" />
                              ) : (
                                <span className="text-2xl opacity-20">⚙️</span>
                              )}
                            </div>
                            <div className="flex-grow min-w-0">
                              <h3 className="text-[#111111] font-serif font-medium truncate">{part.part_name}</h3>
                              <p className="text-[#737373] text-xs font-mono mb-3 truncate">{part.part_number || "No Part #"}</p>
                              <div className="flex items-center gap-3">
                                <button onClick={() => handleUpdateQuantity(part.id, part.quantity, -1)} className="w-8 h-8 rounded-none bg-[#111111] hover:bg-white text-[#F9F9F7] hover:text-[#111111] border-2 border-[#111111] flex items-center justify-center font-serif">-</button>
                                <span className={`text-base font-medium w-6 text-center ${part.quantity === 0 ? 'text-[#CC0000]' : 'text-[#111111]'}`}>{part.quantity}</span>
                                <button onClick={() => handleUpdateQuantity(part.id, part.quantity, 1)} className="w-8 h-8 rounded-none bg-[#111111] hover:bg-white text-[#F9F9F7] hover:text-[#111111] border-2 border-[#111111] flex items-center justify-center font-serif">+</button>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-full text-center py-12 border border-dashed border-[#111111] border rounded-none text-[#737373] text-sm">
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
        <div className="fixed inset-0 bg-[#F9F9F7]/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover border border-[#111111] border sm:rounded-none rounded-none-t-3xl p-6 sm:p-8 w-full max-w-md animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <h3 className="text-lg font-medium text-[#111111] mb-6">📦 Register New Spare Part</h3>
            <form onSubmit={handleAddPart} className="space-y-5">
              <div>
                <label className="block text-[#525252] text-xs mb-2">Part Name</label>
                <input type="text" required value={newPartName} onChange={(e) => setNewPartName(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#525252] text-xs mb-2">Part No.</label>
                  <input type="text" value={newPartNumber} onChange={(e) => setNewPartNumber(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-[#525252] text-xs mb-2">Stock</label>
                  <input type="number" required min="0" value={newPartQuantity} onChange={(e) => setNewPartQuantity(parseInt(e.target.value) || 0)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm" />
                </div>
              </div>
              <div className="flex gap-3 pt-2 pb-4 sm:pb-0">
                <button type="button" onClick={() => setShowAddPart(false)} className="flex-1 bg-[#111111] text-[#111111] rounded-none p-3.5 text-sm font-medium hover:bg-zinc-700">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-[#111111] text-[#F9F9F7] hover:bg-white hover:text-[#111111] hover:border-[#111111] border border-transparent font-serif tracking-widest text-[#111111] rounded-none p-3.5 text-sm font-medium hover:bg-emerald-50 disabled:opacity-50">Save Part</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

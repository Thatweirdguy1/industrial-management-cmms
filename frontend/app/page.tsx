"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";

interface WorkOrder {
  id: number;
  machine_formatted_id?: string;
  machine_raw_name?: string;
  asset_tag?: string;
  schedule_type: string;
  task_category: string;
  description?: string; 
  created_at: string;
  status: string;
}

interface Machine {
  id: number;
  name: string;
  asset_tag: string;
  status: string;
  risk_score?: number; 
}

export default function TechnicianDashboard() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"breakdowns" | "pms">("breakdowns");
  
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [supervisorName, setSupervisorName] = useState(""); 
  const [technicianName, setTechnicianName] = useState("");
  const [operatorName, setOperatorName] = useState(""); 
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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
  
  const [isListening, setIsListening] = useState(false);
  const [listeningField, setListeningField] = useState<"pm" | "report" | "inspection" | "resolve" | null>(null);
  const [transcript, setTranscript] = useState("");
  const [browserSupportsSpeech, setBrowserSupportsSpeech] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://168.144.81.103:5000";

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
        
        <header className="bg-zinc-900/50 border border-zinc-800/80 rounded-3xl p-5 sm:p-8 backdrop-blur-xl">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">Dadri Plant Control</h1>
              <p className="text-zinc-500 text-sm mt-1">दादरी प्लांट कंट्रोल</p>
            </div>
            
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              <Link href="/machines" className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-3 w-full sm:w-auto">
                <span className="text-lg">🗄️</span>
                <div className="text-left">
                  <div className="text-sm">View Registry</div>
                  <div className="text-[10px] text-zinc-400">रजिस्ट्री देखें</div>
                </div>
              </Link>
              <Link href="/analytics" className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-3 w-full sm:w-auto">
                <span className="text-lg">📊</span>
                <div className="text-left">
                  <div className="text-sm">Plant Analytics</div>
                  <div className="text-[10px] text-zinc-400">एनालिटिक्स</div>
                </div>
              </Link>
              <button onClick={() => setShowPMModal(true)} className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/20 font-medium px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-3 w-full sm:w-auto">
                <span className="text-lg">🔧</span>
                <div className="text-left">
                  <div className="text-sm">Log PM</div>
                  <div className="text-[10px] text-amber-500/70">पीएम दर्ज करें</div>
                </div>
              </button>
              <button onClick={() => setShowInspectionModal(true)} className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/20 font-medium px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-3 w-full sm:w-auto">
                <span className="text-lg">📋</span>
                <div className="text-left">
                  <div className="text-sm">Upload Report</div>
                  <div className="text-[10px] text-blue-500/70">रिपोर्ट अपलोड करें</div>
                </div>
              </button>
              <button onClick={() => setShowReportModal(true)} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 font-medium px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-3 w-full sm:w-auto">
                <span className="text-lg">🚨</span>
                <div className="text-left">
                  <div className="text-sm">Report Fault</div>
                  <div className="text-[10px] text-red-500/70">खराबी दर्ज करें</div>
                </div>
              </button>
            </div>
          </div>
        </header>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-4 rounded-xl">{error}</div>}
        
        {/* Tab Controls */}
        <div className="flex border-b border-zinc-800 overflow-x-auto mt-4 mb-6">
          <button 
            onClick={() => setActiveTab("breakdowns")} 
            className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "breakdowns" ? "border-red-500 text-red-400" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
          >
            🚨 Active Breakdowns ({breakdownOrders.length})
          </button>
          <button 
            onClick={() => setActiveTab("pms")} 
            className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "pms" ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
          >
            🛠️ Scheduled Maintenance ({pmOrders.length})
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "breakdowns" && (
          breakdownOrders.length > 0 ? (
            <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {breakdownOrders.map((order) => (
                <div key={order.id} className="bg-red-950/20 border border-red-900/50 rounded-2xl p-5 flex flex-col hover:bg-red-900/30 transition-colors relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse"></div>
                  
                  <div className="flex justify-between items-start mb-4">
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase border bg-red-500/10 text-red-400 border-red-500/20">
                      URGENT
                    </span>
                    <span className="text-zinc-500 text-xs font-mono">Task #{order.id}</span>
                  </div>
                  
                  <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <strong>{order.machine_formatted_id || "000"}</strong> - {order.machine_raw_name || (order as any).machine_name || "Unknown"}
                  </h2>
                  <p className="text-zinc-400 font-mono text-xs mb-4">{order.asset_tag}</p>
                  
                  <div className="bg-zinc-950/50 rounded-xl p-3 mb-4 border border-zinc-800/50 flex-grow">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Issue Reported</p>
                    <p className="text-zinc-300 text-xs leading-relaxed">{order.description}</p>
                  </div>
                  
                  <div className="mb-5 flex items-center gap-2">
                    <div className="w-1 h-8 rounded-full bg-zinc-700"></div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Time Logged</p>
                      <p className="text-zinc-300 text-xs">
                        {new Date(order.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                  
                  <button onClick={() => setSelectedOrder(order)} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.98] mt-auto text-sm">
                    Resolve Issue
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-zinc-800 p-12 rounded-3xl text-center bg-zinc-900/20 flex flex-col items-center justify-center">
              <span className="text-4xl mb-3 opacity-50">✨</span>
              <h3 className="text-lg font-medium text-zinc-400 tracking-tight">No Active Breakdowns</h3>
              <p className="text-zinc-500 text-sm mt-2">All machines are operational.</p>
            </div>
          )
        )}

        {activeTab === "pms" && (
          pmOrders.length > 0 ? (
            <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {pmOrders.map((order) => (
                <div key={order.id} className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 flex flex-col hover:bg-zinc-900/60 transition-colors">
                  <div className="flex justify-between items-start mb-4">
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-medium tracking-wide uppercase border bg-amber-500/10 text-amber-400 border-amber-500/20">
                      Routine / नियमित
                    </span>
                    <span className="text-zinc-500 text-xs font-mono">#{order.id}</span>
                  </div>
                  
                  <h2 className="text-base font-medium text-white mb-1 flex items-center gap-2">
                    <strong>{order.machine_formatted_id || "000"}</strong> - {order.machine_raw_name || (order as any).machine_name || "Unknown"}
                  </h2>
                  <p className="text-zinc-400 font-mono text-xs mb-4">{order.asset_tag}</p>
                  
                  <div className="bg-zinc-950/50 rounded-xl p-3 mb-4 border border-zinc-800/50 flex-grow">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Notes / विवरण</p>
                    <p className="text-zinc-300 text-xs leading-relaxed">{order.description}</p>
                  </div>
                  
                  <div className="mb-5 flex items-center gap-2">
                    <div className="w-1 h-8 rounded-full bg-zinc-700"></div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Logged On / दर्ज किया गया</p>
                      <p className="text-zinc-300 text-xs">
                        {new Date(order.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                  
                  <button onClick={() => setSelectedOrder(order)} className="w-full bg-white text-black font-medium py-3 rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.98] mt-auto text-sm">
                    Open Task / कार्य खोलें
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-zinc-800 p-12 rounded-3xl text-center bg-zinc-900/20 flex flex-col items-center justify-center">
              <span className="text-4xl mb-3 opacity-50">✨</span>
              <h3 className="text-lg font-medium text-zinc-400 tracking-tight">No Scheduled Tasks</h3>
              <p className="text-zinc-500 text-sm mt-2">No pending maintenance required.</p>
            </div>
          )
        )}
      </div>

      {/* SIGN OFF / RESOLVE MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-3xl rounded-t-3xl p-6 sm:p-8 w-full max-w-md animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <h3 className="text-lg font-medium text-white mb-2">Sign Off / साइन ऑफ</h3>
            <p className="text-zinc-400 text-xs mb-6 font-mono bg-zinc-950 p-2 rounded-lg inline-block">Task #{selectedOrder.id}</p>
            
            <form onSubmit={(e) => { e.preventDefault(); handleCompleteTask(); }} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 text-xs mb-2">Sup / सुपरवाइजर</label>
                  <input type="text" required value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="Name / नाम" className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-blue-500/50 text-sm" />
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs mb-2">Tech / तकनीशियन (Optional)</label>
                  <input type="text" value={technicianName} onChange={(e) => setTechnicianName(e.target.value)} placeholder="Name / नाम" className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-blue-500/50 text-sm" />
                </div>
              </div>
              
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Operator / ऑपरेटर (Optional)</label>
                <input type="text" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} placeholder="Type name / नाम दर्ज करें" className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-blue-500/50 text-sm" />
              </div>

              <div>
                <label className="block text-zinc-400 text-xs mb-2">Resolution Notes / समस्या का समाधान</label>
                <div className="flex gap-2">
                  <textarea 
                    rows={2} 
                    value={resolutionNotes} 
                    onChange={(e) => setResolutionNotes(e.target.value)} 
                    className="flex-grow bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-blue-500/50 resize-none text-sm" 
                    placeholder="Describe how the issue was fixed..."
                  />
                  {browserSupportsSpeech && (
                    <button type="button" onClick={() => toggleListen('resolve')} className={`w-14 rounded-xl border transition-all shrink-0 flex items-center justify-center ${isListening && listeningField === 'resolve' ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
                      <span className="text-xl">🎤</span>
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 text-xs mb-2">Evidence / सबूत (Optional)</label>
                <div className="relative border border-dashed border-zinc-700 rounded-xl p-4 text-center bg-zinc-950 hover:bg-zinc-800 transition-colors">
                  <input type="file" capture="environment" multiple accept="image/*" onChange={(e) => setSignOffPhotoFiles(Array.from(e.target.files || []))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  {signOffPhotoFiles.length > 0 ? <span className="text-zinc-200 text-xs">📸 {signOffPhotoFiles.length} photo(s) selected</span> : <span className="text-zinc-500 text-xs uppercase tracking-wide">📷 Tap to Upload</span>}
                </div>
              </div>
              
              <div className="flex gap-3 pt-2 pb-4 sm:pb-0">
                <button type="button" onClick={() => { setSelectedOrder(null); setSignOffPhotoFiles([]); stopListening(); setResolutionNotes(""); }} className="flex-1 bg-zinc-800 text-white rounded-xl p-3.5 text-sm font-medium hover:bg-zinc-700 transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className={`flex-1 text-white rounded-xl p-3.5 text-sm font-medium transition-colors disabled:opacity-50 ${selectedOrder.schedule_type === 'breakdown_report' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
                  {selectedOrder.schedule_type === 'breakdown_report' ? 'Resolve Issue' : 'Complete Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PM MODAL */}
      {showPMModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-3xl rounded-t-3xl p-6 sm:p-8 w-full max-w-md animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <h3 className="text-lg font-medium text-white mb-6">🔧 Log Preventive Maintenance</h3>
            <form onSubmit={handleReportPM} className="space-y-5">
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Machine / मशीन</label>
                <select value={pmMachineId} onChange={(e) => setPmMachineId(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-amber-500/50 text-sm appearance-none">
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {String(m.id).padStart(3, '0')} - {m.name} {m.risk_score && m.risk_score > 75 ? ' ⚠️' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Category / श्रेणी</label>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <label className={`border rounded-xl p-3 flex items-center justify-center cursor-pointer transition-all ${pmCategory === 'mechanical' ? 'bg-amber-500/10 border-amber-500/50 text-amber-400' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}>
                    <input type="radio" name="pm_type" value="mechanical" checked={pmCategory === 'mechanical'} onChange={(e) => setPmCategory(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Mechanical</span>
                  </label>
                  <label className={`border rounded-xl p-3 flex items-center justify-center cursor-pointer transition-all ${pmCategory === 'electrical' ? 'bg-amber-500/10 border-amber-500/50 text-amber-400' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}>
                    <input type="radio" name="pm_type" value="electrical" checked={pmCategory === 'electrical'} onChange={(e) => setPmCategory(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Electrical</span>
                  </label>
                  <label className={`border rounded-xl p-3 flex items-center justify-center cursor-pointer transition-all ${pmCategory === 'other' ? 'bg-amber-500/10 border-amber-500/50 text-amber-400' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}>
                    <input type="radio" name="pm_type" value="other" checked={pmCategory === 'other'} onChange={(e) => setPmCategory(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Other / अन्य</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Details / विवरण</label>
                <div className="flex gap-2">
                  <textarea required rows={2} value={pmDescription} onChange={(e) => setPmDescription(e.target.value)} className="flex-grow bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-amber-500/50 resize-none text-sm" placeholder="Enter service details..."/>
                  {browserSupportsSpeech && (
                    <button type="button" onClick={() => toggleListen('pm')} className={`w-14 rounded-xl border transition-all shrink-0 flex items-center justify-center ${isListening && listeningField === 'pm' ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
                      <span className="text-xl">🎤</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 text-xs mb-2">Sup / सुपरवाइजर</label>
                  <input type="text" required value={pmSupervisorName} onChange={(e) => setPmSupervisorName(e.target.value)} placeholder="Name / नाम" className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-amber-500/50 text-sm" />
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs mb-2">Tech / तकनीशियन (Optional)</label>
                  <input type="text" value={pmTechnicianName} onChange={(e) => setPmTechnicianName(e.target.value)} placeholder="Name / नाम" className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-amber-500/50 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Operator / ऑपरेटर (Optional)</label>
                <input type="text" value={pmOperatorName} onChange={(e) => setPmOperatorName(e.target.value)} placeholder="Type name / नाम दर्ज करें" className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-amber-500/50 text-sm" />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Evidence / सबूत (Optional)</label>
                <div className="relative border border-dashed border-zinc-700 rounded-xl p-4 text-center bg-zinc-950 hover:bg-zinc-800 transition-colors">
                  <input type="file" capture="environment" multiple accept="image/*" onChange={(e) => setPmPhotoFiles(Array.from(e.target.files || []))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  {pmPhotoFiles.length > 0 ? <span className="text-zinc-200 text-xs">📸 {pmPhotoFiles.length} photo(s) selected</span> : <span className="text-zinc-500 text-xs uppercase tracking-wide">📷 Tap to Upload Photos</span>}
                </div>
              </div>
              <div className="flex gap-3 pt-2 pb-4 sm:pb-0">
                <button type="button" onClick={() => { setShowPMModal(false); stopListening(); setPmPhotoFiles([]); }} className="flex-1 bg-zinc-800 text-white rounded-xl p-3.5 text-sm font-medium hover:bg-zinc-700 transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-amber-500 text-zinc-950 rounded-xl p-3.5 text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-50">Submit PM</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REPORT FAULT MODAL */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-3xl rounded-t-3xl p-6 sm:p-8 w-full max-w-md animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <h3 className="text-lg font-medium text-white mb-6">🚨 Report Fault / खराबी दर्ज करें</h3>
            <form onSubmit={handleReportBreakdown} className="space-y-5">
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Machine / मशीन</label>
                <select value={reportMachineId} onChange={(e) => setReportMachineId(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-red-500/50 text-sm appearance-none">
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {String(m.id).padStart(3, '0')} - {m.name} {m.risk_score && m.risk_score > 75 ? ' ⚠️' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Category / श्रेणी</label>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <label className={`border rounded-xl p-3 flex items-center justify-center cursor-pointer transition-all ${reportCategory === 'mechanical' ? 'bg-red-500/10 border-red-500/50 text-red-400' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}>
                    <input type="radio" name="fault_type" value="mechanical" checked={reportCategory === 'mechanical'} onChange={(e) => setReportCategory(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Mechanical</span>
                  </label>
                  <label className={`border rounded-xl p-3 flex items-center justify-center cursor-pointer transition-all ${reportCategory === 'electrical' ? 'bg-red-500/10 border-red-500/50 text-red-400' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}>
                    <input type="radio" name="fault_type" value="electrical" checked={reportCategory === 'electrical'} onChange={(e) => setReportCategory(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Electrical</span>
                  </label>
                  <label className={`border rounded-xl p-3 flex items-center justify-center cursor-pointer transition-all ${reportCategory === 'other' ? 'bg-red-500/10 border-red-500/50 text-red-400' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}>
                    <input type="radio" name="fault_type" value="other" checked={reportCategory === 'other'} onChange={(e) => setReportCategory(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Other / अन्य</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Details / विवरण</label>
                <div className="flex gap-2">
                  <textarea required rows={3} value={reportDescription} onChange={(e) => setReportDescription(e.target.value)} className="flex-grow bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-red-500/50 resize-none text-sm" placeholder="Describe the fault clearly..."/>
                  {browserSupportsSpeech && (
                    <button type="button" onClick={() => toggleListen('report')} className={`w-14 rounded-xl border transition-all shrink-0 flex items-center justify-center ${isListening && listeningField === 'report' ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
                      <span className="text-xl">🎤</span>
                    </button>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Fault Photos / फ़ोटो (Optional)</label>
                <div className="relative border border-dashed border-zinc-700 rounded-xl p-4 text-center bg-zinc-950 hover:bg-zinc-800 transition-colors">
                  <input type="file" capture="environment" multiple accept="image/*" onChange={(e) => setReportPhotoFiles(Array.from(e.target.files || []))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  {reportPhotoFiles.length > 0 ? <span className="text-zinc-200 text-xs">📸 {reportPhotoFiles.length} photo(s) selected</span> : <span className="text-zinc-500 text-xs uppercase tracking-wide">📷 Tap to attach Photos</span>}
                </div>
              </div>
              <div className="flex gap-3 pt-2 pb-4 sm:pb-0">
                <button type="button" onClick={() => { setShowReportModal(false); stopListening(); setReportPhotoFiles([]); }} className="flex-1 bg-zinc-800 text-white rounded-xl p-3.5 text-sm font-medium hover:bg-zinc-700 transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-red-600 text-white rounded-xl p-3.5 text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-50">Alert Team</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSPECTION REPORT MODAL */}
      {showInspectionModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-3xl rounded-t-3xl p-6 sm:p-8 w-full max-w-md animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <h3 className="text-lg font-medium text-white mb-6">📋 Upload Inspection Report</h3>
            <form onSubmit={handleUploadInspection} className="space-y-5">
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Machine / मशीन</label>
                <select value={inspectionMachineId} onChange={(e) => setInspectionMachineId(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-blue-500/50 text-sm appearance-none">
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {String(m.id).padStart(3, '0')} - {m.name} {m.risk_score && m.risk_score > 75 ? ' ⚠️' : ''}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Engineer / वेंडर</label>
                <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3">
                  <label className={`border rounded-xl p-3 flex items-center justify-center cursor-pointer transition-all ${inspectionEngineerType === 'internal' ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}>
                    <input type="radio" name="eng_type" value="internal" checked={inspectionEngineerType === 'internal'} onChange={(e) => setInspectionEngineerType(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Internal Team</span>
                  </label>
                  <label className={`border rounded-xl p-3 flex items-center justify-center cursor-pointer transition-all ${inspectionEngineerType === 'external' ? 'bg-purple-500/10 border-purple-500/50 text-purple-400' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}>
                    <input type="radio" name="eng_type" value="external" checked={inspectionEngineerType === 'external'} onChange={(e) => setInspectionEngineerType(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">External Vendor</span>
                  </label>
                </div>
                <input type="text" required value={inspectionEngineerName} onChange={(e) => setInspectionEngineerName(e.target.value)} placeholder="Engineer/Company Name *" className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-blue-500/50 text-sm" />
              </div>
              
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Notes / विवरण (Optional)</label>
                <div className="flex gap-2">
                  <textarea rows={2} value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} className="flex-grow bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-blue-500/50 resize-none text-sm" placeholder="Additional details..."/>
                  {browserSupportsSpeech && (
                    <button type="button" onClick={() => toggleListen('inspection')} className={`w-14 rounded-xl border transition-all shrink-0 flex items-center justify-center ${isListening && listeningField === 'inspection' ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
                      <span className="text-xl">🎤</span>
                    </button>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-zinc-400 text-xs mb-2">Document / फ़ाइल</label>
                <div className="relative border border-dashed border-zinc-700 rounded-xl p-4 text-center bg-zinc-950 hover:bg-zinc-800 transition-colors">
                  <input type="file" capture="environment" accept=".pdf,.doc,.docx,image/*" onChange={(e) => setInspectionFile(e.target.files ? e.target.files[0] : null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  {inspectionFile ? <span className="text-zinc-200 text-xs">📎 {inspectionFile.name}</span> : <span className="text-zinc-500 text-xs uppercase tracking-wide">📎 Tap to attach File/Photo</span>}
                </div>
              </div>
              
              <div className="flex gap-3 pt-2 pb-4 sm:pb-0">
                <button type="button" onClick={() => { setShowInspectionModal(false); stopListening(); }} className="flex-1 bg-zinc-800 text-white rounded-xl p-3.5 text-sm font-medium hover:bg-zinc-700 transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 text-white rounded-xl p-3.5 text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50">Upload Report</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </main>
  );
}
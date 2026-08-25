"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { compressImages } from "@/utils/imageCompression";

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
  const [breakdownOrders, setBreakdownOrders] = useState<any[]>([]);
  const [pmOrders, setPmOrders] = useState<any[]>([]);
  const [predictiveAlerts, setPredictiveAlerts] = useState<any[]>([]);
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [allReports, setAllReports] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"breakdowns" | "pms" | "predictive" | "reports">("breakdowns");
  
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

  const [availableParts, setAvailableParts] = useState<any[]>([]);
  const [partsUsed, setPartsUsed] = useState<{part_id: number, part_name: string, quantity: number}[]>([]);

  const [reportsPage, setReportsPage] = useState(1);
  const [hasMoreReports, setHasMoreReports] = useState(true);
  
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
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";

  useEffect(() => {
    if (typeof window !== "undefined" && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false; // continuous=true is broken on iOS Safari
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-IN'; // Indian English handles mix of Hindi/English better
      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscript(finalTranscript.trim());
        }
      };
      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };
      recognitionRef.current.onend = () => {
        // Automatically stop listening state when speech ends (iOS behavior)
        setIsListening(false);
      };
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
      const [res, repRes, machinesRes] = await Promise.all([
        fetch(`${baseUrl}/api/work-orders/active`),
        fetch(`${baseUrl}/api/reports?page=1&limit=20`),
        fetch(`${baseUrl}/api/machines`)
      ]);
      
      if (res.ok) {
        const data = await res.json();
        setWorkOrders(data);
        setBreakdownOrders(data.filter((wo: any) => (wo.order_type === 'breakdown' || wo.schedule_type === 'breakdown_report') && wo.status !== 'completed'));
        setPmOrders(data.filter((wo: any) => (wo.order_type === 'preventive' || (wo.schedule_type !== 'breakdown_report' && wo.schedule_type !== 'predictive_alert')) && wo.status !== 'completed'));
        setPredictiveAlerts(data.filter((wo: any) => wo.schedule_type === 'predictive_alert' && wo.status !== 'completed'));
      }
      
      if (repRes.ok) {
        const reportsData = await repRes.json();
        setAllReports(reportsData);
        if (reportsData.length < 20) setHasMoreReports(false);
        setReportsPage(1);
      }
      
      if (machinesRes.ok) {
        const machinesData = await machinesRes.json();
        setMachines(machinesData);
        if (machinesData.length > 0) {
          setReportMachineId(machinesData[0].id.toString());
          setPmMachineId(machinesData[0].id.toString());
          setInspectionMachineId(machinesData[0].id.toString());
        }
      }
    } catch (err: any) {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const loadMoreReports = async () => {
    try {
      const nextPage = reportsPage + 1;
      const res = await fetch(`${baseUrl}/api/reports?page=${nextPage}&limit=20`);
      if (res.ok) {
        const newData = await res.json();
        if (newData.length < 20) setHasMoreReports(false);
        setAllReports((prev) => [...prev, ...newData]);
        setReportsPage(nextPage);
      }
    } catch (e) {
      console.error("Failed to load more reports", e);
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

  const handleOpenSignOff = async (order: any) => {
    setSelectedOrder(order);
    setPartsUsed([]);
    try {
      const res = await fetch(`${baseUrl}/api/machines/${order.machine_id}/parts`);
      if (res.ok) {
        setAvailableParts(await res.json());
      }
    } catch (e) {
      console.error("Failed to load parts");
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
          resolution_notes: resolutionNotes,
          parts_used: partsUsed
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
      setPartsUsed([]);
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
      fetchData();
    } catch (err) {
      alert("Error uploading report.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#F9F9F7] border-2 border-[#111111] flex items-center justify-center p-4"><p className="text-sm text-[#525252] font-medium tracking-widest uppercase animate-pulse">Loading System / सिस्टम लोड हो रहा है...</p></div>;

  return (
    <main className="min-h-screen bg-[#F9F9F7] border-2 border-[#111111] text-[#111111] font-serif p-4 sm:p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <header className="bg-[#F9F9F7] border border-[#111111] border-2 border-[#111111] hard-shadow-hover rounded-none p-5 sm:p-8 backdrop-blur-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Prem Industries Logo" className="h-16 w-auto object-contain" />
            <div>
              <h1 className="text-3xl sm:text-4xl font-semibold text-[#111111] tracking-tight">Dadri Plant Control</h1>
              <p className="text-[#737373] text-sm mt-1">दादरी प्लांट कंट्रोल</p>
            </div>
          </div>
            
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              <Link href="/machines" className="bg-[#111111] hover:bg-white text-[#F9F9F7] hover:text-[#111111] border-2 border-[#111111] font-medium px-5 py-3 rounded-none transition-all flex items-center justify-center gap-3 w-full sm:w-auto">
                <span className="text-lg">🗄️</span>
                <div className="text-left">
                  <div className="text-sm">View Registry</div>
                  <div className="text-[10px] text-current opacity-70">रजिस्ट्री देखें</div>
                </div>
              </Link>
              <Link href="/analytics" className="bg-[#111111] hover:bg-white text-[#F9F9F7] hover:text-[#111111] border-2 border-[#111111] font-medium px-5 py-3 rounded-none transition-all flex items-center justify-center gap-3 w-full sm:w-auto">
                <span className="text-lg">📊</span>
                <div className="text-left">
                  <div className="text-sm">Plant Analytics</div>
                  <div className="text-[10px] text-current opacity-70">एनालिटिक्स</div>
                </div>
              </Link>
              <Link href="/utility-report" className="bg-[#111111] hover:bg-white text-[#F9F9F7] hover:text-[#111111] border-2 border-[#111111] font-medium px-5 py-3 rounded-none transition-all flex items-center justify-center gap-3 w-full sm:w-auto">
                <span className="text-lg">⚙️</span>
                <div className="text-left">
                  <div className="text-sm">Utility Report</div>
                  <div className="text-[10px] text-current opacity-70">यूटिलिटी रिपोर्ट</div>
                </div>
              </Link>
              <button onClick={() => setShowPMModal(true)} className="bg-white border-2 border-[#111111] text-[#111111] hover:bg-[#111111] hover:text-[#F9F9F7] border  font-medium px-5 py-3 rounded-none transition-all flex items-center justify-center gap-3 w-full sm:w-auto">
                <span className="text-lg">🔧</span>
                <div className="text-left">
                  <div className="text-sm">Log PM</div>
                  <div className="text-[10px] text-current opacity-70">पीएम दर्ज करें</div>
                </div>
              </button>
              <button onClick={() => setShowInspectionModal(true)} className="bg-white border-2 border-[#111111] text-[#111111] hover:bg-[#111111] hover:text-[#F9F9F7] font-medium px-5 py-3 rounded-none transition-all flex items-center justify-center gap-3 w-full sm:w-auto">
                <span className="text-lg">📋</span>
                <div className="text-left">
                  <div className="text-sm">Upload Report</div>
                  <div className="text-[10px] text-current opacity-70">रिपोर्ट अपलोड करें</div>
                </div>
              </button>
              <button onClick={() => setShowReportModal(true)} className="bg-white border-2 border-[#CC0000] text-[#CC0000] hover:bg-[#CC0000] hover:text-[#F9F9F7] font-medium px-5 py-3 rounded-none transition-all flex items-center justify-center gap-3 w-full sm:w-auto">
                <span className="text-lg">🚨</span>
                <div className="text-left">
                  <div className="text-sm">Report Fault</div>
                  <div className="text-[10px] text-current opacity-70">खराबी दर्ज करें</div>
                </div>
              </button>
            </div>
        </header>

        {error && <div className="bg-[#111111]/10 border border-red-500/30 text-[#CC0000] text-sm p-4 rounded-none">{error}</div>}
        
        {/* Historical Report Section */}
        <div className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover p-5 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-6">
          <div>
            <h2 className="text-xl font-semibold text-[#111111] tracking-tight">Historical PM Reports</h2>
            <p className="text-[#737373] text-sm mt-1">Export a complete history of all Preventive Maintenance, organized by month</p>
          </div>
          <a href={`${baseUrl}/api/reports/monthly-pm/download`} download className="bg-[#111111] text-white hover:bg-white hover:text-[#111111] border-2 border-[#111111] font-medium px-6 py-3 rounded-none transition-colors whitespace-nowrap inline-flex items-center gap-2">
            <span>📥</span> Download All PM Reports (.xlsx)
          </a>
        </div>

        <div className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover p-5 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-6">
          <div>
            <h2 className="text-xl font-semibold text-[#111111] tracking-tight">Weekly Executive Summary</h2>
            <p className="text-[#737373] text-sm mt-1">Download the latest automated PDF report containing MTTR, Downtime, and Problematic Machines</p>
          </div>
          <a href={`${baseUrl}/api/reports/weekly`} download className="bg-[#111111] text-white hover:bg-white hover:text-[#111111] border-2 border-[#111111] font-medium px-6 py-3 rounded-none transition-colors whitespace-nowrap inline-flex items-center gap-2">
            <span>📄</span> Download Weekly Report (PDF)
          </a>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-[#111111] border overflow-x-auto mt-6 mb-6">
          <button 
            onClick={() => setActiveTab("breakdowns")} 
            className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "breakdowns" ? "border-red-500 text-[#CC0000]" : "border-transparent text-[#525252] hover:text-[#111111]"}`}
          >
            🚨 Active Breakdowns ({breakdownOrders.length})
          </button>
          <button 
            onClick={() => setActiveTab("pms")} 
            className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === "pms" ? "border-amber-500 text-[#CC0000]" : "border-transparent text-[#525252] hover:text-[#111111]"}`}
          >
            🛠️ Scheduled Maintenance ({pmOrders.length})
          </button>
          <button 
            onClick={() => setActiveTab("predictive")}
            className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap flex items-center gap-2 ${activeTab === "predictive" ? "border-emerald-500 text-emerald-600" : "border-transparent text-[#525252] hover:text-[#111111]"}`}
          >
            Predictive Alerts
            {predictiveAlerts.length > 0 && (
              <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                {predictiveAlerts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={`pb-4 px-2 text-sm font-medium transition-colors border-b-4 rounded-none ${
              activeTab === "reports"
                ? "border-b-2 border-[#111111] text-[#111111]"
                : "border-transparent text-[#737373] hover:text-[#111111] hover:border-[#111111]/30"
            }`}
          >
            📋 All Reports ({allReports.length})
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "breakdowns" && (
          breakdownOrders.length > 0 ? (
            <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {breakdownOrders.map((order) => (
                <div key={order.id} className="bg-[#F9F9F7] hard-shadow-hover border-black border-2 border border-black rounded-none p-5 flex flex-col hover:bg-neutral-100 transition-colors relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse"></div>
                  
                  <div className="flex justify-between items-start mb-4">
                    <span className="px-2.5 py-1 rounded-none text-[10px] font-serif tracking-wide uppercase border bg-[#111111]/10 text-[#CC0000] border-[#111111]/20">
                      URGENT
                    </span>
                    <span className="text-[#737373] text-xs font-mono">Task #{order.id}</span>
                  </div>
                  
                  <h2 className="text-lg font-serif text-[#111111] mb-1 flex items-center gap-2">
                    <strong>{order.machine_formatted_id || "000"}</strong> - {order.machine_raw_name || (order as any).machine_name || "Unknown"}
                  </h2>
                  <p className="text-[#525252] font-mono text-xs mb-4">{order.asset_tag}</p>
                  
                  <div className="bg-[#F9F9F7] border-2 border-[#111111]/50 rounded-none p-3 mb-4 border border-[#111111] border/50 flex-grow">
                    <p className="text-[10px] text-[#737373] uppercase tracking-wider mb-1">Issue Reported</p>
                    <p className="text-[#111111] text-xs leading-relaxed">{order.description}</p>
                  </div>
                  
                  <div className="mb-5 flex items-center gap-2">
                    <div className="w-1 h-8 rounded-none bg-zinc-700"></div>
                    <div>
                      <p className="text-[10px] text-[#737373] uppercase tracking-widest">Time Logged</p>
                      <p className="text-[#111111] text-xs">
                        {new Date(order.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                  
                  <button onClick={() => handleOpenSignOff(order)} className="w-full bg-[#111111] text-[#F9F9F7] hover:bg-white hover:text-[#111111] hover:border-[#111111] border border-transparent font-serif tracking-[0.1em] border-2 border-[#111111] hard-shadow-hover hover:bg-red-500 text-[#111111] font-serif py-3 rounded-none transition-transform hover:scale-[1.02] active:scale-[0.98] mt-auto text-sm">
                    Resolve Issue
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-[#111111] border p-12 rounded-none text-center bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover/20 flex flex-col items-center justify-center">
              <span className="text-4xl mb-3 opacity-50">✨</span>
              <h3 className="text-lg font-medium text-[#525252] tracking-tight">No Active Breakdowns</h3>
              <p className="text-[#737373] text-sm mt-2">All machines are operational.</p>
            </div>
          )
        )}

        {activeTab === "pms" && (
          pmOrders.length > 0 ? (
            <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {pmOrders.map((order) => (
                <div key={order.id} className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover border border-[#111111] border rounded-none p-5 flex flex-col hover:bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover/60 transition-colors">
                  <div className="flex justify-between items-start mb-4">
                    <span className="px-2.5 py-1 rounded-none text-[10px] font-medium tracking-wide uppercase border bg-[#111111]/20 border-2 border-purple-500 text-[#CC0000] ">
                      Routine / नियमित
                    </span>
                    <span className="text-[#737373] text-xs font-mono">#{order.id}</span>
                  </div>
                  
                  <h2 className="text-base font-medium text-[#111111] mb-1 flex items-center gap-2">
                    <strong>{order.machine_formatted_id || "000"}</strong> - {order.machine_raw_name || (order as any).machine_name || "Unknown"}
                  </h2>
                  <p className="text-[#525252] font-mono text-xs mb-4">{order.asset_tag}</p>
                  
                  <div className="bg-[#F9F9F7] border-2 border-[#111111]/50 rounded-none p-3 mb-4 border border-[#111111] border/50 flex-grow">
                    <p className="text-[10px] text-[#737373] uppercase tracking-wider mb-1">Notes / विवरण</p>
                    <p className="text-[#111111] text-xs leading-relaxed">{order.description}</p>
                  </div>
                  
                  <div className="mb-5 flex items-center gap-2">
                    <div className="w-1 h-8 rounded-none bg-zinc-700"></div>
                    <div>
                      <p className="text-[10px] text-[#737373] uppercase tracking-widest">Logged On / दर्ज किया गया</p>
                      <p className="text-[#111111] text-xs">
                        {new Date(order.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                  
                  <button onClick={() => handleOpenSignOff(order)} className="w-full bg-white text-black font-medium py-3 rounded-none transition-transform hover:scale-[1.02] active:scale-[0.98] mt-auto text-sm">
                    Open Task / कार्य खोलें
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-[#111111] border p-12 rounded-none text-center bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover/20 flex flex-col items-center justify-center">
              <span className="text-4xl mb-3 opacity-50">✨</span>
              <h3 className="text-lg font-medium text-[#525252] tracking-tight">No Scheduled Tasks</h3>
              <p className="text-[#737373] text-sm mt-2">No pending maintenance required.</p>
            </div>
          )
        )}

        {activeTab === "predictive" && (
          predictiveAlerts.length > 0 ? (
            <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {predictiveAlerts.map((order) => (
                <div key={order.id} className="bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border p-5 flex flex-col hard-shadow-hover transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <span className="px-2.5 py-1 rounded-none text-[10px] font-serif tracking-wide uppercase border bg-emerald-50 text-emerald-700 border-emerald-200">
                      PREDICTIVE ALERT
                    </span>
                    <span className="text-[#737373] text-xs font-mono">#{order.id}</span>
                  </div>
                  
                  <h2 className="text-lg font-serif text-[#111111] mb-1">
                    {order.machine_raw_name || 'Unknown Machine'}
                  </h2>
                  <p className="text-xs text-[#525252] font-mono mb-4 bg-zinc-100 p-2 border border-[#111111] inline-block">Asset: {order.asset_tag || 'N/A'}</p>
                  
                  <div className="bg-emerald-50/50 border border-emerald-200 p-3 mb-5 flex-grow border-l-4 border-l-emerald-500">
                    <p className="text-sm font-medium text-emerald-900 line-clamp-3">
                      {order.description}
                    </p>
                  </div>
                  
                  <div className="mb-5 flex items-center gap-2">
                    <div className="w-1 h-8 rounded-none bg-emerald-500"></div>
                    <div>
                      <p className="text-[10px] text-[#737373] uppercase tracking-widest">Alert Time / अलर्ट समय</p>
                      <p className="text-[#111111] text-xs">
                        {new Date(order.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                  
                  <button onClick={() => handleOpenSignOff(order)} className="w-full bg-white border-2 border-[#111111] text-[#111111] font-bold py-3 rounded-none transition-transform hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(16,185,129,1)] hover:border-emerald-500 mt-auto text-sm uppercase tracking-widest">
                    Resolve Alert
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-[#111111] p-12 rounded-none text-center bg-[#F9F9F7] flex flex-col items-center justify-center">
              <span className="text-4xl mb-3 opacity-50">🟢</span>
              <h3 className="text-lg font-medium text-[#525252] tracking-tight">No Predictive Alerts</h3>
              <p className="text-[#737373] text-sm mt-2">All machines are operating within normal parameters.</p>
            </div>
          )
        )}
        
        {activeTab === "reports" && (
          allReports.length > 0 ? (
            <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* UPLOADED INSPECTION REPORTS */}
              {allReports.map((report) => (
                <div key={`rep-${report.id}`} className="bg-[#F9F9F7] hard-shadow-hover border-black border-2 p-5 flex flex-col hover:bg-neutral-100 transition-colors">
                  <div className="flex justify-between items-start mb-4">
                    <span className="px-2.5 py-1 rounded-none text-[10px] font-serif tracking-wide uppercase border bg-[#111111] text-[#F9F9F7] border-[#111111]">
                      INSPECTION
                    </span>
                    <span className="text-[#737373] text-xs font-mono">{new Date(report.created_at).toLocaleDateString()}</span>
                  </div>
                  
                  <h2 className="text-lg font-serif text-[#111111] mb-1">
                    <strong>{report.formatted_id || "000"}</strong> - {report.machine_name || "Unknown"}
                  </h2>
                  <p className="text-[#111111] font-mono text-xs mb-4">Uploaded By: {report.engineer_name || "Unknown"} ({report.engineer_type || "N/A"})</p>
                  
                  <div className="bg-white border border-[#111111] border/50 rounded-none p-3 mb-4 flex-grow">
                    <p className="text-[10px] text-[#737373] uppercase tracking-wider mb-1">Notes</p>
                    <p className="text-[#111111] text-xs leading-relaxed">{report.notes || "No notes provided."}</p>
                  </div>
                  
                  {report.file_url && (
                    <a href={`${baseUrl}${report.file_url}`} target="_blank" rel="noopener noreferrer" className="w-full text-center bg-white border border-[#111111] text-[#111111] hover:bg-[#111111] hover:text-[#F9F9F7] text-sm py-2 px-4 transition-colors font-medium">
                      View File
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-[#111111] p-12 rounded-none text-center bg-[#F9F9F7] flex flex-col items-center justify-center">
              <span className="text-4xl mb-3 opacity-50">📋</span>
              <h3 className="text-lg font-medium text-[#525252] tracking-tight">No Reports</h3>
              <p className="text-[#737373] text-sm mt-2">No completed inspection reports found.</p>
            </div>
          )
        )}
        
        {activeTab === "reports" && hasMoreReports && allReports.length > 0 && (
          <div className="mt-8 flex justify-center">
            <button onClick={loadMoreReports} className="bg-white border-2 border-[#111111] text-[#111111] px-6 py-3 font-serif hover:bg-[#111111] hover:text-white transition-colors hard-shadow-hover text-sm tracking-widest uppercase font-bold">
              Load More Reports
            </button>
          </div>
        )}
      </div>

      {/* SIGN OFF / RESOLVE MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-[#F9F9F7]/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover border border-[#111111] border sm:rounded-none rounded-none-t-3xl p-6 sm:p-8 w-full max-w-md animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <h3 className="text-lg font-medium text-[#111111] mb-2">Sign Off / साइन ऑफ</h3>
            <p className="text-[#525252] text-xs mb-6 font-mono bg-[#F9F9F7] border-2 border-[#111111] p-2 rounded-none inline-block">Task #{selectedOrder.id}</p>
            
            <form onSubmit={(e) => { e.preventDefault(); handleCompleteTask(); }} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#525252] text-xs mb-2">Sup / सुपरवाइजर</label>
                  <input type="text" required value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="Name / नाम" className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-gray-200/50 text-sm" />
                </div>
                <div>
                  <label className="block text-[#525252] text-xs mb-2">Tech / तकनीशियन (Optional)</label>
                  <input type="text" value={technicianName} onChange={(e) => setTechnicianName(e.target.value)} placeholder="Name / नाम" className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-gray-200/50 text-sm" />
                </div>
              </div>
              
              <div>
                <label className="block text-[#525252] text-xs mb-2">Operator / ऑपरेटर (Optional)</label>
                <input type="text" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} placeholder="Type name / नाम दर्ज करें" className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-gray-200/50 text-sm" />
              </div>

              <div>
                <label className="block text-[#525252] text-xs mb-2">Resolution Notes / समस्या का समाधान</label>
                <div className="flex gap-2">
                  <textarea 
                    rows={2} 
                    value={resolutionNotes} 
                    onChange={(e) => setResolutionNotes(e.target.value)} 
                    className="flex-grow bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-gray-200/50 resize-none text-sm" 
                    placeholder="Describe how the issue was fixed..."
                  />
                  {browserSupportsSpeech && (
                    <button type="button" onClick={() => toggleListen('resolve')} className={`w-14 rounded-none border transition-all shrink-0 flex items-center justify-center ${isListening && listeningField === 'resolve' ? 'bg-red-500/20 border-red-500 text-[#CC0000] animate-pulse' : 'bg-[#F9F9F7] border-2 border-[#111111] border-[#111111] border text-[#525252] hover:text-[#111111]'}`}>
                      <span className="text-xl">🎤</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Spare Parts Section */}
              <div className="border border-[#111111] p-4 bg-white shadow-[2px_2px_0px_0px_rgba(17,17,17,1)]">
                <label className="block text-[#111111] font-serif font-bold text-sm mb-3 border-b-2 border-[#111111] pb-2">🔧 Spare Parts Used (Optional)</label>
                
                {partsUsed.map((p, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-center">
                    <span className="flex-1 text-xs font-mono bg-zinc-50 border border-[#111111] p-2 truncate">{p.part_name}</span>
                    <span className="text-xs font-mono bg-zinc-50 border border-[#111111] p-2 w-16 text-center">x{p.quantity}</span>
                    <button type="button" onClick={() => setPartsUsed(partsUsed.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700 p-2 font-bold text-sm">✕</button>
                  </div>
                ))}

                <div className="flex gap-2 mt-3">
                  <select id="part-select" className="flex-1 bg-white border-2 border-[#111111] p-2 text-xs font-mono outline-none">
                    <option value="">-- Select Part --</option>
                    {availableParts.map(ap => (
                      <option key={ap.id} value={ap.id}>{ap.part_name} (Avail: {ap.quantity})</option>
                    ))}
                  </select>
                  <input type="number" id="part-qty" min="1" defaultValue="1" className="w-16 bg-white border-2 border-[#111111] p-2 text-xs font-mono outline-none text-center" />
                  <button type="button" onClick={() => {
                    const sel = document.getElementById('part-select') as HTMLSelectElement;
                    const qty = document.getElementById('part-qty') as HTMLInputElement;
                    if (sel.value && qty.value) {
                      const partName = sel.options[sel.selectedIndex].text.split(' (')[0];
                      setPartsUsed([...partsUsed, { part_id: parseInt(sel.value), quantity: parseInt(qty.value), part_name: partName }]);
                      sel.value = "";
                      qty.value = "1";
                    }
                  }} className="bg-[#111111] text-[#F9F9F7] px-3 text-xs font-bold font-serif hover:bg-zinc-800 border-2 border-[#111111]">ADD</button>
                </div>
              </div>

              <div>
                <label className="block text-[#525252] text-xs mb-2">Evidence / सबूत (Optional)</label>
                <label className="relative border border-dashed border-[#111111] rounded-none p-4 text-center bg-[#F9F9F7] border-2 border-[#111111] hover:bg-[#111111] transition-colors block cursor-pointer">
                  <input type="file" multiple accept="image/*" onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    setSignOffPhotoFiles(await compressImages(files));
                  }} className="hidden" />
                  {signOffPhotoFiles.length > 0 ? <span className="text-[#111111] text-xs">📸 {signOffPhotoFiles.length} photo(s) selected</span> : <span className="text-[#737373] text-xs uppercase tracking-wide">📷 Tap to Upload</span>}
                </label>
              </div>
              
              <div className="flex gap-3 pt-2 pb-4 sm:pb-0">
                <button type="button" onClick={() => { setSelectedOrder(null); setSignOffPhotoFiles([]); stopListening(); setResolutionNotes(""); setPartsUsed([]); }} className="flex-1 bg-[#111111] text-[#111111] rounded-none p-3.5 text-sm font-medium hover:bg-zinc-700 transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className={`flex-1 text-[#111111] rounded-none p-3.5 text-sm font-medium transition-colors disabled:opacity-50 ${selectedOrder.schedule_type === 'breakdown_report' ? 'bg-[#111111] text-[#F9F9F7] hover:bg-white hover:text-[#111111] hover:border-[#111111] border border-transparent font-serif tracking-widest hover:bg-emerald-500' : 'bg-white text-black border-2 border-white hard-shadow-hover hover:bg-gray-200'}`}>
                  {selectedOrder.schedule_type === 'breakdown_report' ? 'Resolve Issue' : 'Complete Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PM MODAL */}
      {showPMModal && (
        <div className="fixed inset-0 bg-[#F9F9F7]/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover border border-[#111111] border sm:rounded-none rounded-none-t-3xl p-6 sm:p-8 w-full max-w-md animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <h3 className="text-lg font-medium text-[#111111] mb-6">🔧 Log Preventive Maintenance</h3>
            <form onSubmit={handleReportPM} className="space-y-5">
              <div>
                <label className="block text-[#525252] text-xs mb-2">Machine / मशीन</label>
                <select value={pmMachineId} onChange={(e) => setPmMachineId(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-amber-500/50 text-sm appearance-none">
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {String(m.id).padStart(3, '0')} - {m.name} {m.risk_score && m.risk_score > 75 ? ' ⚠️' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[#525252] text-xs mb-2">Category / श्रेणी</label>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <label className={`border rounded-none p-3 flex items-center justify-center cursor-pointer transition-all ${pmCategory === 'mechanical' ? 'bg-[#111111]/20 border-2 border-purple-500 border-amber-500/50 text-[#CC0000]' : 'bg-[#F9F9F7] border-2 border-[#111111] border-[#111111] border text-[#525252] hover:bg-[#111111]'}`}>
                    <input type="radio" name="pm_type" value="mechanical" checked={pmCategory === 'mechanical'} onChange={(e) => setPmCategory(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Mechanical</span>
                  </label>
                  <label className={`border rounded-none p-3 flex items-center justify-center cursor-pointer transition-all ${pmCategory === 'electrical' ? 'bg-[#111111]/20 border-2 border-purple-500 border-amber-500/50 text-[#CC0000]' : 'bg-[#F9F9F7] border-2 border-[#111111] border-[#111111] border text-[#525252] hover:bg-[#111111]'}`}>
                    <input type="radio" name="pm_type" value="electrical" checked={pmCategory === 'electrical'} onChange={(e) => setPmCategory(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Electrical</span>
                  </label>
                  <label className={`border rounded-none p-3 flex items-center justify-center cursor-pointer transition-all ${pmCategory === 'other' ? 'bg-[#111111]/20 border-2 border-purple-500 border-amber-500/50 text-[#CC0000]' : 'bg-[#F9F9F7] border-2 border-[#111111] border-[#111111] border text-[#525252] hover:bg-[#111111]'}`}>
                    <input type="radio" name="pm_type" value="other" checked={pmCategory === 'other'} onChange={(e) => setPmCategory(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Other / अन्य</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-[#525252] text-xs mb-2">Details / विवरण</label>
                <div className="flex gap-2">
                  <textarea required rows={2} value={pmDescription} onChange={(e) => setPmDescription(e.target.value)} className="flex-grow bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-amber-500/50 resize-none text-sm" placeholder="Enter service details..."/>
                  {browserSupportsSpeech && (
                    <button type="button" onClick={() => toggleListen('pm')} className={`w-14 rounded-none border transition-all shrink-0 flex items-center justify-center ${isListening && listeningField === 'pm' ? 'bg-red-500/20 border-red-500 text-[#CC0000] animate-pulse' : 'bg-[#F9F9F7] border-2 border-[#111111] border-[#111111] border text-[#525252] hover:text-[#111111]'}`}>
                      <span className="text-xl">🎤</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#525252] text-xs mb-2">Sup / सुपरवाइजर</label>
                  <input type="text" required value={pmSupervisorName} onChange={(e) => setPmSupervisorName(e.target.value)} placeholder="Name / नाम" className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-amber-500/50 text-sm" />
                </div>
                <div>
                  <label className="block text-[#525252] text-xs mb-2">Tech / तकनीशियन (Optional)</label>
                  <input type="text" value={pmTechnicianName} onChange={(e) => setPmTechnicianName(e.target.value)} placeholder="Name / नाम" className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-amber-500/50 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-[#525252] text-xs mb-2">Operator / ऑपरेटर (Optional)</label>
                <input type="text" value={pmOperatorName} onChange={(e) => setPmOperatorName(e.target.value)} placeholder="Type name / नाम दर्ज करें" className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-amber-500/50 text-sm" />
              </div>
              <div>
                <label className="block text-[#525252] text-xs mb-2">Evidence / सबूत (Optional)</label>
                <label className="relative border border-dashed border-[#111111] rounded-none p-4 text-center bg-[#F9F9F7] border-2 border-[#111111] hover:bg-[#111111] transition-colors block cursor-pointer">
                  <input type="file" multiple accept="image/*" onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    setPmPhotoFiles(await compressImages(files));
                  }} className="hidden" />
                  {pmPhotoFiles.length > 0 ? <span className="text-[#111111] text-xs">📸 {pmPhotoFiles.length} photo(s) selected</span> : <span className="text-[#737373] text-xs uppercase tracking-wide">📷 Tap to Upload Photos</span>}
                </label>
              </div>
              <div className="flex gap-3 pt-2 pb-4 sm:pb-0">
                <button type="button" onClick={() => { setShowPMModal(false); stopListening(); setPmPhotoFiles([]); }} className="flex-1 bg-[#111111] text-[#111111] rounded-none p-3.5 text-sm font-medium hover:bg-zinc-700 transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-amber-500 text-zinc-950 rounded-none p-3.5 text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-50">Submit PM</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REPORT FAULT MODAL */}
      {showReportModal && (
        <div className="fixed inset-0 bg-[#F9F9F7]/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover border border-[#111111] border sm:rounded-none rounded-none-t-3xl p-6 sm:p-8 w-full max-w-md animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <h3 className="text-lg font-medium text-[#111111] mb-6">🚨 Report Fault / खराबी दर्ज करें</h3>
            <form onSubmit={handleReportBreakdown} className="space-y-5">
              <div>
                <label className="block text-[#525252] text-xs mb-2">Machine / मशीन</label>
                <select value={reportMachineId} onChange={(e) => setReportMachineId(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-red-500/50 text-sm appearance-none">
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {String(m.id).padStart(3, '0')} - {m.name} {m.risk_score && m.risk_score > 75 ? ' ⚠️' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[#525252] text-xs mb-2">Category / श्रेणी</label>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <label className={`border rounded-none p-3 flex items-center justify-center cursor-pointer transition-all ${reportCategory === 'mechanical' ? 'bg-[#111111]/10 border-red-500/50 text-[#CC0000]' : 'bg-[#F9F9F7] border-2 border-[#111111] border-[#111111] border text-[#525252] hover:bg-[#111111]'}`}>
                    <input type="radio" name="fault_type" value="mechanical" checked={reportCategory === 'mechanical'} onChange={(e) => setReportCategory(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Mechanical</span>
                  </label>
                  <label className={`border rounded-none p-3 flex items-center justify-center cursor-pointer transition-all ${reportCategory === 'electrical' ? 'bg-[#111111]/10 border-red-500/50 text-[#CC0000]' : 'bg-[#F9F9F7] border-2 border-[#111111] border-[#111111] border text-[#525252] hover:bg-[#111111]'}`}>
                    <input type="radio" name="fault_type" value="electrical" checked={reportCategory === 'electrical'} onChange={(e) => setReportCategory(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Electrical</span>
                  </label>
                  <label className={`border rounded-none p-3 flex items-center justify-center cursor-pointer transition-all ${reportCategory === 'other' ? 'bg-[#111111]/10 border-red-500/50 text-[#CC0000]' : 'bg-[#F9F9F7] border-2 border-[#111111] border-[#111111] border text-[#525252] hover:bg-[#111111]'}`}>
                    <input type="radio" name="fault_type" value="other" checked={reportCategory === 'other'} onChange={(e) => setReportCategory(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Other / अन्य</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-[#525252] text-xs mb-2">Details / विवरण</label>
                <div className="flex gap-2">
                  <textarea required rows={3} value={reportDescription} onChange={(e) => setReportDescription(e.target.value)} className="flex-grow bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-red-500/50 resize-none text-sm" placeholder="Describe the fault clearly..."/>
                  {browserSupportsSpeech && (
                    <button type="button" onClick={() => toggleListen('report')} className={`w-14 rounded-none border transition-all shrink-0 flex items-center justify-center ${isListening && listeningField === 'report' ? 'bg-red-500/20 border-red-500 text-[#CC0000] animate-pulse' : 'bg-[#F9F9F7] border-2 border-[#111111] border-[#111111] border text-[#525252] hover:text-[#111111]'}`}>
                      <span className="text-xl">🎤</span>
                    </button>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-[#525252] text-xs mb-2">Fault Photos / फ़ोटो (Optional)</label>
                <label className="relative border border-dashed border-[#111111] rounded-none p-4 text-center bg-[#F9F9F7] border-2 border-[#111111] hover:bg-[#111111] transition-colors block cursor-pointer">
                  <input type="file" multiple accept="image/*" onChange={(e) => setReportPhotoFiles(Array.from(e.target.files || []))} className="hidden" />
                  {reportPhotoFiles.length > 0 ? <span className="text-[#111111] text-xs">📸 {reportPhotoFiles.length} photo(s) selected</span> : <span className="text-[#737373] text-xs uppercase tracking-wide">📷 Tap to attach Photos</span>}
                </label>
              </div>
              <div className="flex gap-3 pt-2 pb-4 sm:pb-0">
                <button type="button" onClick={() => { setShowReportModal(false); stopListening(); setReportPhotoFiles([]); }} className="flex-1 bg-[#111111] text-[#111111] rounded-none p-3.5 text-sm font-medium hover:bg-zinc-700 transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-[#111111] text-[#F9F9F7] hover:bg-white hover:text-[#111111] hover:border-[#111111] border border-transparent font-serif tracking-[0.1em] border-2 border-[#111111] hard-shadow-hover text-[#111111] rounded-none p-3.5 text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-50">Alert Team</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSPECTION REPORT MODAL */}
      {showInspectionModal && (
        <div className="fixed inset-0 bg-[#F9F9F7]/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-[#F9F9F7] border-2 border-[#111111] hard-shadow-hover border border-[#111111] border sm:rounded-none rounded-none-t-3xl p-6 sm:p-8 w-full max-w-md animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <h3 className="text-lg font-medium text-[#111111] mb-6">📋 Upload Inspection Report</h3>
            <form onSubmit={handleUploadInspection} className="space-y-5">
              <div>
                <label className="block text-[#525252] text-xs mb-2">Machine / मशीन</label>
                <select value={inspectionMachineId} onChange={(e) => setInspectionMachineId(e.target.value)} className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-gray-200/50 text-sm appearance-none">
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {String(m.id).padStart(3, '0')} - {m.name} {m.risk_score && m.risk_score > 75 ? ' ⚠️' : ''}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-[#525252] text-xs mb-2">Engineer / वेंडर</label>
                <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3">
                  <label className={`border rounded-none p-3 flex items-center justify-center cursor-pointer transition-all ${inspectionEngineerType === 'internal' ? 'bg-gray-200/10 border-gray-200/50 text-blue-400' : 'bg-[#F9F9F7] border-2 border-[#111111] border-[#111111] border text-[#525252] hover:bg-[#111111]'}`}>
                    <input type="radio" name="eng_type" value="internal" checked={inspectionEngineerType === 'internal'} onChange={(e) => setInspectionEngineerType(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">Internal Team</span>
                  </label>
                  <label className={`border rounded-none p-3 flex items-center justify-center cursor-pointer transition-all ${inspectionEngineerType === 'external' ? 'bg-[#111111]/20 border-purple-500/50 text-[#CC0000]' : 'bg-[#F9F9F7] border-2 border-[#111111] border-[#111111] border text-[#525252] hover:bg-[#111111]'}`}>
                    <input type="radio" name="eng_type" value="external" checked={inspectionEngineerType === 'external'} onChange={(e) => setInspectionEngineerType(e.target.value)} className="hidden"/>
                    <span className="text-[10px] sm:text-xs font-medium uppercase">External Vendor</span>
                  </label>
                </div>
                <input type="text" required value={inspectionEngineerName} onChange={(e) => setInspectionEngineerName(e.target.value)} placeholder="Engineer/Company Name *" className="w-full bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-gray-200/50 text-sm" />
              </div>
              
              <div>
                <label className="block text-[#525252] text-xs mb-2">Notes / विवरण (Optional)</label>
                <div className="flex gap-2">
                  <textarea rows={2} value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} className="flex-grow bg-[#F9F9F7] border-2 border-[#111111] border border-[#111111] border text-[#111111] rounded-none p-3.5 outline-none focus:ring-2 focus:ring-gray-200/50 resize-none text-sm" placeholder="Additional details..."/>
                  {browserSupportsSpeech && (
                    <button type="button" onClick={() => toggleListen('inspection')} className={`w-14 rounded-none border transition-all shrink-0 flex items-center justify-center ${isListening && listeningField === 'inspection' ? 'bg-red-500/20 border-red-500 text-[#CC0000] animate-pulse' : 'bg-[#F9F9F7] border-2 border-[#111111] border-[#111111] border text-[#525252] hover:text-[#111111]'}`}>
                      <span className="text-xl">🎤</span>
                    </button>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-[#525252] text-xs mb-2">Document / फ़ाइल</label>
                <label className="relative border border-dashed border-[#111111] rounded-none p-4 text-center bg-[#F9F9F7] border-2 border-[#111111] hover:bg-[#111111] transition-colors block cursor-pointer">
                  <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={(e) => setInspectionFile(e.target.files ? e.target.files[0] : null)} className="hidden" />
                  {inspectionFile ? <span className="text-[#111111] text-xs">📎 {inspectionFile.name}</span> : <span className="text-[#737373] text-xs uppercase tracking-wide">📎 Tap to attach File/Photo</span>}
                </label>
              </div>
              
              <div className="flex gap-3 pt-2 pb-4 sm:pb-0">
                <button type="button" onClick={() => { setShowInspectionModal(false); stopListening(); }} className="flex-1 bg-[#111111] text-[#111111] rounded-none p-3.5 text-sm font-medium hover:bg-zinc-700 transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-white text-black border-2 border-white hard-shadow-hover text-[#111111] rounded-none p-3.5 text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50">Upload Report</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </main>
  );
}

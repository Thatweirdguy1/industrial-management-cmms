"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LoadingScreen from "../components/LoadingScreen";
import AppIcon from "../components/AppIcon";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

interface AnalyticsData {
  mttr: number;
  mtbf: number;
  total_breakdowns: number;
  total_downtime: number;
  chart_data: { name: string; Breakdowns: number; "Downtime (Hrs)": number; MTTR: number; MTBF: number }[];
  temporal_chart: { day: string; Breakdowns: number }[];
  team_chart: { name: string; Tasks: number; AvgTime: number }[];
  ratio_chart: { name: string; value: number }[];
}

const COLORS = ['#10b981', '#f87171'];
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_URL}/api/analytics`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingScreen label="Compiling plant dashboards" />;

  const chartOnlyData = data?.chart_data.filter(m => m.Breakdowns > 0) || [];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 font-sans">
      <div className="max-w-[90rem] mx-auto space-y-6 pb-12">
        <header data-reveal className="bg-zinc-900/50 border border-zinc-800/80 rounded-3xl p-5 sm:p-8 backdrop-blur-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div><Link href="/" className="text-zinc-400 hover:text-white text-xs font-medium uppercase tracking-wider mb-4 flex items-center gap-2 transition-colors"><span>←</span> Back Home</Link><h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">Plant Intelligence</h1><p className="text-zinc-500 text-sm mt-1">प्लांट एनालिटिक्स</p></div>
          <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"><AppIcon name="chart" size={18} /> Predictive Engine Online</div>
        </header>

        <div data-reveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"><p className="text-zinc-400 text-[10px] uppercase tracking-widest font-semibold mb-2">Plant MTBF (Reliability)</p><div className="flex items-end gap-2"><span className="text-4xl font-bold text-emerald-400">{data?.mtbf || 0}</span><span className="text-zinc-500 font-medium mb-1 text-sm">Hours</span></div></div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"><p className="text-zinc-400 text-[10px] uppercase tracking-widest font-semibold mb-2">Plant MTTR (Repair Speed)</p><div className="flex items-end gap-2"><span className="text-4xl font-bold text-white">{data?.mttr || 0}</span><span className="text-zinc-500 font-medium mb-1 text-sm">Hours</span></div></div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"><p className="text-zinc-400 text-[10px] uppercase tracking-widest font-semibold mb-2">Total Failures</p><div className="flex items-end gap-2"><span className="text-4xl font-bold text-red-400">{data?.total_breakdowns || 0}</span><span className="text-zinc-500 font-medium mb-1 text-sm">Incidents</span></div></div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"><p className="text-zinc-400 text-[10px] uppercase tracking-widest font-semibold mb-2">Accumulated Downtime</p><div className="flex items-end gap-2"><span className="text-4xl font-bold text-amber-400">{data?.total_downtime || 0}</span><span className="text-zinc-500 font-medium mb-1 text-sm">Hours</span></div></div>
        </div>

        <div data-reveal className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 lg:col-span-1 flex flex-col"><h2 className="text-sm font-medium text-white mb-1">80/20 Maintenance Strategy</h2><p className="text-zinc-500 text-xs mb-6">Proactive vs Emergency Worklogs</p><div className="flex-grow flex items-center justify-center"><div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data?.ratio_chart} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">{data?.ratio_chart.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }} /><Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px', color: '#a1a1aa' }}/></PieChart></ResponsiveContainer></div></div></div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 lg:col-span-2"><h2 className="text-sm font-medium text-white mb-1">Asset Vulnerability Profile</h2><p className="text-zinc-500 text-xs mb-6">Total Failure Load and Time Loss Index per Machine</p><div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartOnlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} /><XAxis dataKey="name" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} /><YAxis yAxisId="left" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} /><YAxis yAxisId="right" orientation="right" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: '#27272a' }} contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }} /><Bar yAxisId="left" dataKey="Breakdowns" fill="#f87171" radius={[4,4,0,0]} barSize={20} /><Bar yAxisId="right" dataKey="Downtime (Hrs)" fill="#fbbf24" radius={[4,4,0,0]} barSize={20} /></BarChart></ResponsiveContainer></div></div>
        </div>

        <div data-reveal className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"><h2 className="text-sm font-medium text-white mb-1">Temporal Breakdown Heatmap</h2><p className="text-zinc-500 text-xs mb-6">Weekly shift cluster trends mapping structural crashes</p><div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={data?.temporal_chart} margin={{ top:10,right:10,left:-20,bottom:0 }}><CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false}/><XAxis dataKey="day" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false}/><YAxis stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false}/><Tooltip cursor={{ fill:'#27272a' }} contentStyle={{ backgroundColor:'#09090b',borderColor:'#27272a',borderRadius:'12px',fontSize:'12px' }}/><Line type="monotone" dataKey="Breakdowns" stroke="#f87171" strokeWidth={3} dot={{ fill:'#f87171',strokeWidth:2,r:4 }} activeDot={{ r:6 }}/></LineChart></ResponsiveContainer></div></div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"><h2 className="text-sm font-medium text-white mb-1">Crew Resolution Leaderboard</h2><p className="text-zinc-500 text-xs mb-6">Total signed tasks completed by responding technicians</p><div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.team_chart} layout="vertical" margin={{ top:10,right:10,left:20,bottom:0 }}><CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false}/><XAxis type="number" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="name" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} width={80}/><Tooltip cursor={{ fill:'#27272a' }} contentStyle={{ backgroundColor:'#09090b',borderColor:'#27272a',borderRadius:'12px',fontSize:'12px' }}/><Bar dataKey="Tasks" fill="#3b82f6" radius={[0,4,4,0]} barSize={20}/></BarChart></ResponsiveContainer></div></div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden mt-6"><div className="p-6 border-b border-zinc-800 bg-zinc-900/50"><h2 className="text-sm font-medium text-white mb-1">Asset Reliability Matrix</h2><p className="text-zinc-500 text-xs">Individual performance and failure metrics per machine</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm whitespace-nowrap"><thead className="text-[10px] text-zinc-500 uppercase tracking-widest border-b border-zinc-800 bg-zinc-950/50"><tr><th className="px-6 py-4 font-medium">Machine Name</th><th className="px-6 py-4 font-medium">Breakdowns</th><th className="px-6 py-4 font-medium">Downtime</th><th className="px-6 py-4 font-medium">MTTR (Repair Speed)</th><th className="px-6 py-4 font-medium">MTBF (Reliability)</th></tr></thead><tbody className="divide-y divide-zinc-800/50">{data?.chart_data.map((row,i)=><tr key={i} className="hover:bg-zinc-800/30 transition-colors"><td className="px-6 py-4 font-medium text-zinc-200">{row.name}</td><td className="px-6 py-4">{row.Breakdowns}</td><td className="px-6 py-4 text-amber-400 font-mono text-xs">{row["Downtime (Hrs)"]} hrs</td><td className="px-6 py-4 text-white font-mono text-xs">{row.MTTR} hrs</td><td className="px-6 py-4 text-emerald-400 font-mono text-xs">{row.MTBF} hrs</td></tr>)}</tbody></table></div></div>
      </div>
    </main>
  );
}

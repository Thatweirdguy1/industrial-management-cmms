"use client";

import { useState, useEffect, ReactNode } from "react";

// Target Location: Prem Industries Unit 4
const TARGET_LAT = 28.5258;
const TARGET_LON = 77.5747;
const MAX_DISTANCE_KM = 3.0;

const PASSWORD = "prem4@2026";
const TOKEN_KEY = "prem_geofence_auth";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Haversine formula
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

export default function GeofenceWrapper({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "authorized" | "blocked">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    // 1. Check LocalStorage for a valid token (Device Memory for 1 month)
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      const timestamp = parseInt(token, 10);
      if (Date.now() - timestamp < THIRTY_DAYS_MS) {
        setStatus("authorized");
        return;
      } else {
        localStorage.removeItem(TOKEN_KEY); // Expired
      }
    }

    // 2. Check Geolocation
    if (!navigator.geolocation) {
      setErrorMsg("Geolocation is not supported by your browser.");
      setStatus("blocked");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const dist = getDistanceFromLatLonInKm(
          position.coords.latitude,
          position.coords.longitude,
          TARGET_LAT,
          TARGET_LON
        );
        if (dist <= MAX_DISTANCE_KM) {
          setStatus("authorized");
        } else {
          setErrorMsg(`You are ${dist.toFixed(1)}km away from the facility (Max ${MAX_DISTANCE_KM}km).`);
          setStatus("blocked");
        }
      },
      (error) => {
        setErrorMsg("Location access denied or unavailable. Please enable GPS permissions.");
        setStatus("blocked");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, []);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPassword === PASSWORD) {
      localStorage.setItem(TOKEN_KEY, Date.now().toString());
      setStatus("authorized");
    } else {
      setPasswordError("Incorrect master password.");
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#F9F9F7] flex flex-col items-center justify-center p-4">
        <span className="text-4xl animate-pulse mb-4">🌍</span>
        <p className="text-sm text-[#525252] uppercase tracking-widest font-mono font-bold">Verifying Location...</p>
      </div>
    );
  }

  if (status === "authorized") {
    return <>{children}</>;
  }

  // Blocked Screen with Password Fallback
  return (
    <div className="min-h-screen bg-[#F9F9F7] flex flex-col items-center justify-center p-6 text-[#111111] font-sans">
      <div className="max-w-md w-full border-2 border-[#111111] p-8 hard-shadow-hover bg-white">
        <div className="text-center mb-8">
          <span className="text-5xl mb-4 block">🚫</span>
          <h1 className="text-2xl font-serif font-bold tracking-tight mb-2">Restricted Area</h1>
          <p className="text-[#525252] text-sm leading-relaxed border-l-2 border-red-500 pl-3 text-left bg-red-50 p-3">
            {errorMsg}
          </p>
        </div>

        <div className="border-t-2 border-dashed border-[#111111] pt-6">
          <p className="text-xs text-[#737373] uppercase tracking-wider mb-4 font-mono font-bold">Override Authorization</p>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Enter Master Password"
                value={inputPassword}
                onChange={(e) => {
                  setInputPassword(e.target.value);
                  setPasswordError("");
                }}
                className="w-full bg-[#F9F9F7] border-2 border-[#111111] p-4 text-[#111111] outline-none font-mono focus:border-red-500"
              />
              {passwordError && (
                <p className="text-red-600 text-xs mt-2 font-bold">{passwordError}</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full bg-[#111111] text-[#F9F9F7] py-4 font-serif tracking-widest hover:bg-red-600 transition-colors border-2 border-transparent hover:border-[#111111] hard-shadow-hover"
            >
              UNLOCK SYSTEM
            </button>
          </form>
          <p className="text-[10px] text-center text-[#737373] mt-4 font-mono">
            * Successful authorization caches device for 30 days.
          </p>
        </div>
      </div>
    </div>
  );
}

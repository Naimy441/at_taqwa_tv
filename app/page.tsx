"use client";

import React, { useEffect, useState } from "react";
import { Sunrise } from "@deemlol/next-icons";
import { Sunset } from "@deemlol/next-icons";
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';
import { DateTime } from 'luxon';
import RTSPView from './components/RTSPView';

const PRIMARY = "rgba(34,74,35,0.86)";
const PRIMARY_DARK = "rgba(24,54,25,0.95)";
const PRIMARY_ACCENT = "#b0e6b2";

const hijriFormatter = new Intl.DateTimeFormat('en-TN-u-ca-islamic-umalqura', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

const gregorianFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

function getCurrentTime() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const formattedHours = hours % 12 || 12;
  const formattedMinutes = minutes.toString().padStart(2, '0');
  return `${formattedHours}:${formattedMinutes}${ampm}`;
}

function splitTime(time: string) {
  // Handle format "02:00 PM"
  const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return { main: time, suffix: "" };
  // Remove leading zero from hours
  const hours = parseInt(match[1], 10).toString();
  const minutes = match[2];
  return { main: `${hours}:${minutes}`, suffix: match[3].toUpperCase() };
}

function useCountdown(initialSeconds: number) {
  const [seconds, setSeconds] = useState(initialSeconds);
  useEffect(() => {
    if (seconds <= 0) return;
    const interval = setInterval(() => setSeconds(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(interval);
  }, [seconds]);
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return { hrs, mins, secs };
}

interface PrayerTime {
  name: string;
  start: string;
  iqamah: string;
  image: string;
}

interface JummahTime {
  time: string;
}

interface JummahData {
  khutbahs: string[];
  iqamas: string[];
}

interface IqamaTiming {
  date: number;
  fajr: string;
  dhuhr: string;
  asr: string;
  isha: string;
}

interface AladhanResponse {
  data: {
    timings: {
      Fajr: string;
      Sunrise: string;
      Dhuhr: string;
      Asr: string;
      Maghrib: string;
      Isha: string;
      Sunset: string;
    };
  };
}

export default function Home() {
  const [currentTime, setCurrentTime] = useState(splitTime(getCurrentTime()));
  const [currentPrayerIndex, setCurrentPrayerIndex] = useState(0);
  const [timeUntilNextPrayer, setTimeUntilNextPrayer] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [hijriDate, setHijriDate] = useState(hijriFormatter.format(new Date()));
  const [gregorianDate, setGregorianDate] = useState(gregorianFormatter.format(new Date()));
  const [prayerTimes, setPrayerTimes] = useState<PrayerTime[]>([]);
  const [jummahTimes, setJummahTimes] = useState<string[]>([]);
  const [jummahIqamas, setJummahIqamas] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sunrise, setSunrise] = useState(splitTime("6:32AM"));
  const [sunset, setSunset] = useState(splitTime("8:09PM"));
  const [showRTSP, setShowRTSP] = useState(false);
  const [rtspReady, setRtspReady] = useState(false);

  function getCurrentPrayerIndex() {
    if (prayerTimes.length === 0) return 0;
    
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;

    for (let i = 0; i < prayerTimes.length; i++) {
      const prayerTime = prayerTimes[i].iqamah;
      const [time, period] = prayerTime.split(/(?=[AP]M)/);
      const [hours, minutes] = time.split(':').map(Number);
      const prayerTimeInMinutes = (hours % 12 + (period === 'PM' ? 12 : 0)) * 60 + minutes;

      if (currentTimeInMinutes < prayerTimeInMinutes) {
        return i;
      }
    }
    return 0; // If all prayers have passed, return Fajr
  }

  function getTimeUntilNextPrayer() {
    if (prayerTimes.length === 0) return 0;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentSecond = now.getSeconds();
    const currentTimeInSeconds = currentHour * 3600 + currentMinute * 60 + currentSecond;

    // Get next prayer time
    const nextPrayerIndex = getCurrentPrayerIndex();
    const nextPrayerTime = prayerTimes[nextPrayerIndex].iqamah;
    const [time, period] = nextPrayerTime.split(/(?=[AP]M)/);
    const [hours, minutes] = time.split(':').map(Number);
    const prayerTimeInSeconds = (hours % 12 + (period === 'PM' ? 12 : 0)) * 3600 + minutes * 60;

    let timeUntilPrayer = prayerTimeInSeconds - currentTimeInSeconds;
    
    // If the prayer time has passed, calculate time until next day's Fajr
    if (timeUntilPrayer < 0) {
      const fajrTime = prayerTimes[0].iqamah;
      const [fajrTimeStr, fajrPeriod] = fajrTime.split(/(?=[AP]M)/);
      const [fajrHours, fajrMinutes] = fajrTimeStr.split(':').map(Number);
      const fajrTimeInSeconds = (fajrHours % 12 + (fajrPeriod === 'PM' ? 12 : 0)) * 3600 + fajrMinutes * 60;
      timeUntilPrayer = (24 * 3600 - currentTimeInSeconds) + fajrTimeInSeconds;
    }

    return timeUntilPrayer;
  }

  // Fetch prayer times from Aladhan API
  useEffect(() => {
    const fetchPrayerTimes = async () => {
      try {
        // Fetch athan times from Aladhan API
        const formattedDate = DateTime.now()
          .setZone('America/Chicago')
          .toFormat('dd-MM-yyyy');

        const apiUrl = `https://api.aladhan.com/v1/timingsByAddress/${formattedDate}`;
        const params = {
          address: '10415 Synott Rd, Sugar Land, TX 77498',
          method: '2',
          timezone: 'America/Chicago'
        };

        const fullUrl = `${apiUrl}?${new URLSearchParams(params).toString()}`;
        const response = await fetch(fullUrl);
        const data: AladhanResponse = await response.json();

        // Convert 24h format to 12h format
        const convertTo12Hour = (time: string) => {
          const [hours, minutes] = time.split(':');
          const hour = parseInt(hours);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const hour12 = hour % 12 || 12;
          return `${hour12}:${minutes} ${ampm}`;
        };

        // Add 2 minutes to a time string
        const addMinutes = (time: string) => {
          const [hours, minutes] = time.split(':');
          const date = new Date();
          date.setHours(parseInt(hours));
          date.setMinutes(parseInt(minutes));
          date.setMinutes(date.getMinutes() + 2);
          const newHours = date.getHours();
          const newMinutes = date.getMinutes().toString().padStart(2, '0');
          const ampm = newHours >= 12 ? 'PM' : 'AM';
          const hour12 = newHours % 12 || 12;
          return `${hour12}:${newMinutes} ${ampm}`;
        };

        // Update sunrise and sunset
        setSunrise(splitTime(convertTo12Hour(data.data.timings.Sunrise)));
        setSunset(splitTime(convertTo12Hour(data.data.timings.Sunset)));

        // Fetch jummah times
        const jummahSnapshot = await getDocs(collection(db, 'jummahTimings'));
        const jummahDoc = jummahSnapshot.docs[0];
        const jummahData = jummahDoc.data() as JummahData;
        setJummahTimes(jummahData.khutbahs);
        setJummahIqamas(jummahData.iqamas);

        // Fetch iqama timings
        const iqamaSnapshot = await getDocs(collection(db, 'iqamaTimings'));
        const iqamaDocs = iqamaSnapshot.docs.map(doc => ({
          ...doc.data(),
          date: doc.data().date
        })) as IqamaTiming[];

        // Get current timestamp
        const currentTimestamp = DateTime.now().setZone('America/Chicago').toMillis();

        // Find the iqama timing with the date closest to but not exceeding current time
        const mostRecentIqama = iqamaDocs
          .filter(doc => doc.date <= currentTimestamp) // Only consider dates in the past
          .reduce((closest, current) => {
            if (!closest) return current;
            return current.date > closest.date ? current : closest;
          });

        if (!mostRecentIqama) {
          console.error('No valid iqama timing found');
          setIsLoading(false);
          return;
        }

        // Create prayer times array with the most recent iqama timings
        const prayers: PrayerTime[] = [
          { 
            name: "FAJR", 
            start: convertTo12Hour(data.data.timings.Fajr),
            iqamah: mostRecentIqama.fajr,
            image: "/prayers/fajr.png"
          },
          { 
            name: "DHUHR", 
            start: convertTo12Hour(data.data.timings.Dhuhr),
            iqamah: mostRecentIqama.dhuhr,
            image: "/prayers/dhuhr.png"
          },
          { 
            name: "ASR", 
            start: convertTo12Hour(data.data.timings.Asr),
            iqamah: mostRecentIqama.asr,
            image: "/prayers/asr.png"
          },
          { 
            name: "MAGHRIB", 
            start: convertTo12Hour(data.data.timings.Maghrib),
            iqamah: addMinutes(data.data.timings.Maghrib), // 2 minutes after maghrib athan
            image: "/prayers/maghrib.png"
          },
          { 
            name: "ISHA", 
            start: convertTo12Hour(data.data.timings.Isha),
            iqamah: mostRecentIqama.isha,
            image: "/prayers/isha.png"
          }
        ];

        setPrayerTimes(prayers);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching prayer times:', error);
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchPrayerTimes();

    // Set up daily refresh at midnight
    const now = DateTime.now().setZone('America/Chicago');
    const tomorrow = now.plus({ days: 1 }).startOf('day');
    const msUntilMidnight = tomorrow.toMillis() - now.toMillis();

    const midnightTimer = setTimeout(() => {
      fetchPrayerTimes();
      // Set up subsequent daily refreshes
      const dailyTimer = setInterval(fetchPrayerTimes, 24 * 60 * 60 * 1000);
      return () => clearInterval(dailyTimer);
    }, msUntilMidnight);

    return () => clearTimeout(midnightTimer);
  }, []);

  // Add this function to check if it's Friday
  function isFriday() {
    return DateTime.now().setZone('America/Chicago').weekday === 5;
  }

  // Add this function to get time until next jummah
  function getTimeUntilNextJummah() {
    if (!isFriday() || jummahTimes.length === 0) return null;

    const now = DateTime.now().setZone('America/Chicago');
    const currentTime = now.toFormat('hh:mm a');

    // Find the next jummah time that hasn't passed
    for (const jummahTime of jummahTimes) {
      const [time, period] = jummahTime.split(' ');
      const [hours, minutes] = time.split(':');
      const jummahDateTime = now.set({ 
        hour: parseInt(hours) + (period === 'PM' ? 12 : 0), 
        minute: parseInt(minutes),
        second: 0,
        millisecond: 0
      });

      if (jummahDateTime > now) {
        return jummahDateTime.diff(now, ['hours', 'minutes', 'seconds']).toObject();
      }
    }

    return null; // All jummahs have passed
  }

  // Add this function to check if we should show RTSP
  function shouldShowRTSP() {
    if (!isFriday() || jummahTimes.length === 0) return false;

    const now = DateTime.now().setZone('America/Chicago');
    const currentTime = now.toFormat('HH:mm');

    // Check each jummah time
    for (let i = 0; i < jummahTimes.length; i++) {
      const khutbahTime = jummahTimes[i];
      const salahTime = jummahIqamas[i];
      
      // Convert times to DateTime objects
      const [khutbahHour, khutbahMinute] = khutbahTime.split(':');
      const khutbahDateTime = now.set({ 
        hour: parseInt(khutbahHour) + (khutbahTime.includes('PM') ? 12 : 0), 
        minute: parseInt(khutbahMinute),
        second: 0,
        millisecond: 0
      });

      const [salahHour, salahMinute] = salahTime.split(':');
      const salahDateTime = now.set({ 
        hour: parseInt(salahHour) + (salahTime.includes('PM') ? 12 : 0), 
        minute: parseInt(salahMinute),
        second: 0,
        millisecond: 0
      });

      // Show RTSP 5 minutes before khutbah
      const fiveMinutesBeforeKhutbah = khutbahDateTime.minus({ minutes: 5 });
      // Hide RTSP 15 minutes after salah
      const fifteenMinutesAfterSalah = salahDateTime.plus({ minutes: 15 });

      if (now >= fiveMinutesBeforeKhutbah && now <= fifteenMinutesAfterSalah) {
        return true;
      }
    }

    return false;
  }

  // Update the timer effect to check for RTSP visibility
  useEffect(() => {
    if (prayerTimes.length === 0) return;

    const timer = setInterval(() => {
      setCurrentTime(splitTime(getCurrentTime()));
      const timeUntil = getTimeUntilNextPrayer();
      if (!isNaN(timeUntil)) {
        setTimeUntilNextPrayer(timeUntil);
      }
      setHijriDate(hijriFormatter.format(new Date()));
      setGregorianDate(gregorianFormatter.format(new Date()));

      const newPrayerIndex = getCurrentPrayerIndex();
      if (newPrayerIndex !== currentPrayerIndex) {
        setIsTransitioning(true);
        setTimeout(() => {
          setCurrentPrayerIndex(newPrayerIndex);
          setIsTransitioning(false);
        }, 500);
      }

      // Check if we should show RTSP
      const shouldLoadRTSP = shouldShowRTSP();
      
      // If we should show RTSP and it's not showing, start loading
      if (shouldLoadRTSP && !showRTSP) {
        setShowRTSP(true);
      } 
      // If we shouldn't show RTSP and it is showing, start transition back
      else if (!shouldLoadRTSP && showRTSP) {
        // First fade in the main content
        setRtspReady(false);
        // Then after the fade transition, remove the RTSP view
        setTimeout(() => {
          setShowRTSP(false);
        }, 500); // Match the transition duration
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentPrayerIndex, prayerTimes]);

  const hrs = Math.floor(timeUntilNextPrayer / 3600);
  const mins = Math.floor((timeUntilNextPrayer % 3600) / 60);
  const secs = timeUntilNextPrayer % 60;

  // Update the countdown display section
  const renderCountdown = () => {
    if (isFriday()) {
      const jummahCountdown = getTimeUntilNextJummah();
      if (jummahCountdown) {
        return (
          <>
            <div className="text-white text-2xl 2xl:text-3xl font-medium text-center mb-2 tracking-wide">
              NEXT JUMMAH IN
            </div>
            <div className="flex gap-8 text-white font-bold">
              <div className="flex flex-col items-center">
                <span className="text-7xl 2xl:text-7xl">{Math.floor(jummahCountdown.hours || 0).toString().padStart(2, '0')}</span>
                <span className="text-base 2xl:text-2xl font-semibold mt-1">hours</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-7xl 2xl:text-7xl">{Math.floor(jummahCountdown.minutes || 0).toString().padStart(2, '0')}</span>
                <span className="text-base 2xl:text-2xl font-semibold mt-1">minutes</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-7xl 2xl:text-7xl">{Math.floor(jummahCountdown.seconds || 0).toString().padStart(2, '0')}</span>
                <span className="text-base 2xl:text-2xl font-semibold mt-1">seconds</span>
              </div>
            </div>
          </>
        );
      }
    }

    // Default iqamah countdown
    return (
      <>
        <div className="text-white text-2xl 2xl:text-3xl font-medium text-center mb-2 tracking-wide">
          NEXT IQAMAH IN
        </div>
        <div className="flex gap-8 text-white font-bold">
          <div className="flex flex-col items-center">
            <span className="text-7xl 2xl:text-8xl">{hrs.toString().padStart(2, '0')}</span>
            <span className="text-base 2xl:text-2xl font-semibold mt-1">hours</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-7xl 2xl:text-8xl">{mins.toString().padStart(2, '0')}</span>
            <span className="text-base 2xl:text-2xl font-semibold mt-1">minutes</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-7xl 2xl:text-8xl">{secs.toString().padStart(2, '0')}</span>
            <span className="text-base 2xl:text-2xl font-semibold mt-1">seconds</span>
          </div>
        </div>
      </>
    );
  };

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center text-white" style={{ background: PRIMARY }}>
        <div className="text-4xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col justify-between text-white overflow-hidden" style={{ background: PRIMARY, fontFamily: 'Arial, sans-serif' }}>
      {showRTSP && <RTSPView isVisible={true} onReady={() => setRtspReady(true)} />}
      
      {/* Main content - Always shown */}
      <div className={`flex-1 w-full grid grid-cols-3 gap-0 h-full transition-opacity duration-500 ${rtspReady ? 'opacity-0' : 'opacity-100'}`}>
        {/* Left: Prayer Times Table (2/3) */}
        <div className="col-span-2 flex flex-col justify-center items-center" style={{ background: PRIMARY_DARK }}>
          <div className="w-full">
            <div
              className="grid text-center text-4xl 2xl:text-6xl font-semibold w-full"
              style={{ gridTemplateColumns: '1.8fr 2.5fr 2.5fr' }}
            >
              <div className="pt-8 text-[#b0e6b2] text-2xl 2xl:text-4xl">&nbsp;</div>
              <div className="pt-8 text-[#b0e6b2] text-2xl 2xl:text-4xl">STARTS</div>
              <div className="pt-8 text-[#b0e6b2] text-2xl 2xl:text-4xl">IQAMAH</div>
              {prayerTimes.map((p, i) => {
                const start = splitTime(p.start);
                const iqamah = splitTime(p.iqamah);
                return (
                  <React.Fragment key={p.name}>
                    <div className={`py-8 2xl:py-10 flex items-center justify-center transition-colors duration-1000 ${i === currentPrayerIndex ? "bg-[#295c2a]/80" : ""}`}>{p.name}</div>
                    <div className={`py-8 2xl:py-10 flex flex-row items-end justify-center transition-colors duration-1000 ${i === currentPrayerIndex ? "bg-[#295c2a]/80" : ""}`}> 
                      <span className="text-8xl 2xl:text-9xl font-bold">{start.main}</span>
                      <span className="text-4xl 2xl:text-5xl font-semibold ml-2 mb-1">{start.suffix}</span>
                    </div>
                    <div className={`py-8 2xl:py-10 flex flex-row items-end justify-center transition-colors duration-1000 ${i === currentPrayerIndex ? "bg-[#295c2a]/80" : ""}`}> 
                      <span className="text-8xl 2xl:text-9xl font-bold">{iqamah.main}</span>
                      <span className="text-4xl 2xl:text-5xl font-semibold ml-2 mb-1">{iqamah.suffix}</span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
        {/* Right: Details (1/3) */}
        <div className="col-span-1 relative flex flex-col justify-center items-center h-full w-full">
          {/* Background Image with Overlay */}
          <div 
            className="absolute inset-0 w-full h-full bg-cover bg-center transition-opacity duration-1000"
            style={{ 
              backgroundImage: `url(${prayerTimes[currentPrayerIndex]?.image})`,
              opacity: isTransitioning ? 0 : 1,
            }}
          />
          <div className="absolute inset-0 bg-black/60" />
          
          {/* Content */}
          <div className="relative z-10 w-full max-w-xl flex flex-col justify-center items-center px-2 py-8">
            {/* Centered Dates */}
            <div className="w-full flex flex-col items-center justify-center">
              <div className="flex flex-col items-center">
                <div className="text-white text-2xl 2xl:text-4xl font-medium mb-2">{gregorianDate}</div>
                <div className="text-white text-3xl 2xl:text-5xl font-bold">{hijriDate}</div>
              </div>
              <div className="w-2/3 border-b-2 border-white/30 my-4 rounded-full" />
            </div>
            {/* Centered Time */}
            <div className="w-full flex flex-col items-center justify-center">
              <div className="font-bold mt-4 mb-4 leading-none flex flex-row items-end justify-center">
                <span className="text-white" style={{ fontSize: '11vw', lineHeight: 1 }}>{currentTime.main}</span>
                <span className="text-white text-4xl 2xl:text-6xl font-semibold ml-2 mb-2">{currentTime.suffix}</span>
              </div>
            </div>
            {/* Next Iqamah Countdown */}
            <div className="w-full flex flex-col items-center justify-center mt-4 mb-4">
              {renderCountdown()}
            </div>
            <div className="w-2/3 border-b-2 border-white/30 my-4 rounded-full" />
            {/* Jumumah */}
            <div className="w-full text-center mt-8">
              <div className="text-2xl 2xl:text-3xl text-white/80 mb-2">JUMMAH KHUTBAH</div>
              <div className="flex flex-col items-center gap-4">
                <div className="flex justify-center gap-12 text-3xl 2xl:text-4xl font-bold text-white">
                  {jummahTimes.map((t, i) => {
                  const jum = splitTime(t);
                  return (
                    <span key={i} className="flex flex-row items-end">
                        <span className="text-3xl 2xl:text-4xl font-bold">{jum.main}</span>
                        <span className="text-xl 2xl:text-2xl font-semibold ml-1 mb-1">{jum.suffix}</span>
                      </span>
                    );
                  })}
                </div>
                <div className="mt-4">
                  <div className="text-2xl 2xl:text-3xl text-white/80 mb-2">JUMMAH SALAH</div>
                  <div className="flex justify-center gap-12 text-3xl 2xl:text-4xl font-bold text-white">
                    {jummahIqamas.map((t, i) => {
                      const salah = splitTime(t);
                      return (
                        <span key={i} className="flex flex-row items-end">
                          <span className="text-3xl 2xl:text-4xl font-bold">{salah.main}</span>
                          <span className="text-xl 2xl:text-2xl font-semibold ml-1 mb-1">{salah.suffix}</span>
                    </span>
                  );
                })}
                  </div>
                </div>
              </div>
            </div>
            {/* Sunrise & Sunset Centered Row */}
            <div className="flex flex-row items-center justify-center mt-8 gap-12 w-full">
              <div className="flex flex-col items-center">
                <Sunrise className="w-12 h-12 text-[#fbbf24]" />
                <span className="text-white font-medium text-2xl 2xl:text-3xl mt-2">SUNRISE</span>
                <span className="flex flex-row items-end font-bold text-white text-3xl 2xl:text-4xl">
                  <span>{sunrise.main}</span>
                  <span className="text-2xl 2xl:text-3xl font-semibold ml-1 mb-1">{sunrise.suffix}</span>
                </span>
              </div>
              <div className="flex flex-col items-center">
                <Sunset className="w-12 h-12 text-[#f87171]" />
                <span className="text-white font-medium text-2xl 2xl:text-3xl mt-2">SUNSET</span>
                <span className="flex flex-row items-end font-bold text-white text-3xl 2xl:text-4xl">
                  <span>{sunset.main}</span>
                  <span className="text-2xl 2xl:text-3xl font-semibold ml-1 mb-1">{sunset.suffix}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface HLSViewProps {
  isVisible: boolean;
  hlsUrl?: string;
  isFullScreen?: boolean;
}

export default function HLSView({ isVisible, hlsUrl, isFullScreen }: HLSViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  useEffect(() => {
    if (!isVisible || !videoRef.current || !hlsUrl) {
      setError("No HLS stream URL provided");
      return;
    }

    const video = videoRef.current;

    const initializeHLS = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true
        });

        hlsRef.current = hls;

        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch((e) => {
            console.error("Error playing video:", e);
            if (retryCountRef.current < MAX_RETRIES) {
              retryCountRef.current++;
              setTimeout(() => {
                video.play();
              }, 1000);
            } else {
              setError("Error playing video");
            }
          });
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error("Network error:", data);
                if (retryCountRef.current < MAX_RETRIES) {
                  retryCountRef.current++;
                  hls.startLoad();
                } else {
                  hls.destroy();
                  setError("Network error occurred");
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error("Media error:", data);
                hls.recoverMediaError();
                break;
              default:
                console.error("Fatal error:", data);
                if (retryCountRef.current < MAX_RETRIES) {
                  retryCountRef.current++;
                  hls.startLoad();
                } else {
                  hls.destroy();
                  setError("Stream error occurred");
                }
                break;
            }
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // For Safari
        video.src = hlsUrl;
        video.addEventListener("loadedmetadata", () => {
          video.play().catch((e) => {
            console.error("Error playing video:", e);
            if (retryCountRef.current < MAX_RETRIES) {
              retryCountRef.current++;
              setTimeout(() => {
                video.play();
              }, 1000);
            } else {
              setError("Error playing video");
            }
          });
        });
      } else {
        setError("HLS is not supported in your browser");
      }
    };

    initializeHLS();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      retryCountRef.current = 0;
    };
  }, [isVisible, hlsUrl]);

  if (!isVisible) return null;

  return (
    <div className={`bg-black transition-all duration-500 ${isFullScreen ? 'fixed inset-0 z-50' : 'h-full w-full'}`}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        muted
        autoPlay
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-white text-xl p-4 rounded bg-red-500/80">
            {error}
          </div>
        </div>
      )}
    </div>
  );
} 
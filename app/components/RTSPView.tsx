"use client";

import { loadPlayer } from "rtsp-relay/browser";
import { useEffect, useRef, useState } from "react";

interface RTSPViewProps {
  isVisible: boolean;
  onReady?: () => void;
}

const MAX_RETRIES = 5;
const RECONNECT_DELAY = 2000; // 2 seconds
const DEBOUNCE_DELAY = 500; // 500ms debounce

export default function RTSPView({ isVisible, onReady }: RTSPViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const [isReady, setIsReady] = useState(false);
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setCanvasDimensions = () => {
    if (!canvasRef.current) return;
    const { innerWidth, innerHeight } = window;
    canvasRef.current.width = innerWidth;
    canvasRef.current.height = innerHeight;
    console.log('Canvas dimensions set:', {
      width: innerWidth,
      height: innerHeight
    });
  };

  const forceCanvasVisible = () => {
    if (!canvasRef.current) return;
    // Force display block and remove any inline display:none
    canvasRef.current.style.display = 'block';
    canvasRef.current.style.visibility = 'visible';
    canvasRef.current.style.opacity = '1';
  };

  const cleanup = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
    }
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    if (playerRef.current) {
      try {
        playerRef.current.destroy?.();
      } catch (e) {
        console.error('Error destroying player:', e);
      }
      playerRef.current = null;
    }
  };

  const initializePlayer = () => {
    if (!canvasRef.current || isConnecting) return;

    console.log('Initializing RTSP player...');
    setCanvasDimensions();

    try {
      setIsConnecting(true);
      // Use the environment variable or fallback to window.location.hostname
      const backendHost = process.env.NEXT_PUBLIC_BACKEND_URL || window.location.hostname;
      const wsUrl = `ws://${backendHost}:2000/api/stream`;
      console.log('Connecting to WebSocket:', wsUrl);

      // Set up observer to watch for style changes
      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      observerRef.current = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            forceCanvasVisible();
          }
        });
      });

      observerRef.current.observe(canvasRef.current, {
        attributes: true,
        attributeFilter: ['style']
      });

      // Cleanup existing player before creating a new one
      cleanup();

      playerRef.current = loadPlayer({
        url: wsUrl,
        canvas: canvasRef.current,
        audio: false,
        onDisconnect: () => {
          console.log('Connection lost!');
          setCanvasDimensions();
          setIsReady(false);
          
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }

          if (retryCountRef.current < MAX_RETRIES) {
            console.log(`Attempting reconnection (${retryCountRef.current + 1}/${MAX_RETRIES})...`);
            retryCountRef.current += 1;
            reconnectTimeoutRef.current = setTimeout(() => {
              setIsConnecting(false);
              initializePlayer();
            }, RECONNECT_DELAY);
          } else {
            console.log('Max retry attempts reached');
            setError('Connection lost - max retry attempts reached');
          }
        }
      });

      // Force canvas visible after initialization
      forceCanvasVisible();

      // Check if canvas is visible and ready
      const checkReady = () => {
        if (canvasRef.current && 
            canvasRef.current.style.display === 'block' && 
            canvasRef.current.width > 0 && 
            canvasRef.current.height > 0) {
          setIsReady(true);
          onReady?.();
          return true;
        }
        return false;
      };

      // Try to check ready state immediately
      if (!checkReady()) {
        // If not ready, set up a check interval
        const readyCheckInterval = setInterval(() => {
          if (checkReady()) {
            clearInterval(readyCheckInterval);
          }
        }, 100);
      }

      console.log('Player initialized:', playerRef.current);
      retryCountRef.current = 0;
      setError(null);
    } catch (error: unknown) {
      console.error('Failed to initialize player:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (!isVisible) {
      cleanup();
      return;
    }

    // Debounce initialization
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
    }

    initTimeoutRef.current = setTimeout(() => {
      setCanvasDimensions();
      initializePlayer();
    }, DEBOUNCE_DELAY);

    const handleResize = () => {
      setCanvasDimensions();
      forceCanvasVisible();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cleanup();
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <canvas 
        ref={canvasRef} 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'black',
          display: 'block'
        }}
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
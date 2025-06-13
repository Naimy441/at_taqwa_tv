"use client";

interface WebRTCViewProps {
  isVisible: boolean;
  webrtcUrl?: string;
  isFullScreen?: boolean;
}

export default function WebRTCView({ isVisible, webrtcUrl, isFullScreen }: WebRTCViewProps) {
  if (!isVisible || !webrtcUrl) return null;

  return (
    <div className={`bg-black transition-all duration-500 ${isFullScreen ? 'fixed inset-0 z-50' : 'h-full w-full'}`}>
      <iframe
        src={webrtcUrl}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen"
      />
    </div>
  );
} 
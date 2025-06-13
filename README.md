# AT Taqwa TV

A modern, responsive digital signage system for AT Taqwa Mosque, displaying prayer times, Jummah schedules, and live streaming capabilities.

## Features

- 🕌 Real-time prayer times display with countdown to next prayer
- 📅 Hijri and Gregorian date display
- 🎥 Live streaming support for Jummah and special events
- ⏰ Automatic Jummah schedule management
- 🌅 Sunrise and sunset times
- 📱 Responsive design for various screen sizes
- 🎨 Modern, clean interface with smooth transitions

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS
- **Video Streaming**: HLS.js
- **Date/Time Handling**: Luxon
- **Database**: Firebase
- **Icons**: @deemlol/next-icons

## Prerequisites

- Node.js (Latest LTS version recommended)
- npm or yarn
- Firebase account (for prayer times and schedule management)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/at_taqwa_tv.git
   cd at_taqwa_tv
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Create a `.env.local` file in the root directory and add your environment variables:
   ```
   NEXT_PUBLIC_HLS_URL=your_hls_stream_url
   NEXT_PUBLIC_WEBRTC_URL=your_webrtc_websocket_url
   NEXT_PUBLIC_FIREBASE_API_KEY=your-var
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-var
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-var
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-var
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-var
   NEXT_PUBLIC_FIREBASE_APP_ID=your-var
   ```

   Note: The system will use WebRTC by default if `NEXT_PUBLIC_WEBRTC_URL` is set. To use HLS streaming, set the debug variable `DEBUG_FORCE_HLS` in app/page.tsx.

4. Start the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

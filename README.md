# 🎵 Find the Imposter

A multiplayer party game where players listen to songs and one imposter secretly hears a different song.

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### 1. Install all dependencies
```bash
npm run install:all
```

### 2. Find your local IP address
- Windows: Run `ipconfig` in a terminal, look for your IPv4 address (e.g. `192.168.1.100`)
- Mac/Linux: Run `ifconfig` or `ip addr`

### 3. Set the server URL for players
Edit `client/.env.local` and set your LAN IP:
```env
NEXT_PUBLIC_SERVER_URL=http://192.168.1.100:3001
```
This is how player phones connect to your server.

### 4. Start everything
```bash
npm run dev
```
This starts:
- **Server** on `http://localhost:3001` (and `http://YOUR_LAN_IP:3001`)
- **Client** on `http://localhost:3000` (and `http://YOUR_LAN_IP:3000`)

### 5. Open the game
- **Game Master**: Open `http://localhost:3000/host` on your laptop
- **Players**: Open `http://YOUR_LAN_IP:3000/join` on their phones (or scan the QR code)

---

## How to Play

1. **Game Master** creates a room → gets a 6-character room code
2. **Players** join by scanning the QR code or visiting the join link and entering the code
3. **Game Master** presses **Randomize Roles** → each player secretly sees their role
4. **Players** press **Ready to Play** (unlocks audio on their device)
5. **Game Master** enters YouTube URLs for Crew Song and Imposter Song
6. **Game Master** presses **Start Round** → all phones play simultaneously
   - Crew phones → Crew Song
   - Imposter phone → Imposter Song
7. Players discuss and vote on who the imposter is
8. **Game Master** presses **End Round & Reveal** → imposter is revealed
9. Press **Next Round** to play again with a new imposter

---

## Architecture

```
LAPTOP (Game Master)
    │
    │ Socket.IO WebSocket
    │
 Node.js Server (port 3001)
    │
    ├── Player Phone 1 → YouTube Song A (local audio)
    ├── Player Phone 2 → YouTube Song A (local audio)
    ├── Player Phone 3 → YouTube Song B (local audio) ← Imposter
    └── Player Phone 4 → YouTube Song A (local audio)
```

**Key principle:** The server only sends commands (play/pause/stop). Each phone loads and plays YouTube audio locally. No audio is streamed from the server.

---

## Project Structure

```
find-the-imposter/
├── server/          Express + Socket.IO backend
│   └── src/
│       ├── index.ts          Server entry point
│       ├── types.ts          TypeScript types
│       ├── roomManager.ts    In-memory room state
│       ├── roleManager.ts    Role assignment logic
│       ├── gameManager.ts    Game state machine
│       └── socketHandler.ts  All Socket.IO events
│
└── client/          Next.js frontend
    └── src/
        ├── app/              Pages (/, /host, /join, /player)
        ├── components/       React components
        ├── lib/              Utilities (socket, session, youtube)
        └── types/            TypeScript types
```

---

## Supported YouTube URL Formats

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
- Just the 11-character video ID

---

## Security Notes

- Players only receive their own role (not other players' roles)
- All game commands are validated server-side
- Room codes avoid ambiguous characters (O, 0, I, 1)
- Sessions use UUIDs stored in localStorage for reconnection

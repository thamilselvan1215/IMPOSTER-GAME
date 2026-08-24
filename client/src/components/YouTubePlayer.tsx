'use client';
import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface YouTubePlayerHandle {
  loadVideo: (videoId: string) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
}

interface Props {
  onReady?: () => void;
  onError?: (code: number) => void;
  onStateChange?: (state: number) => void;
  hidden?: boolean;
}

let apiLoaded = false;
let apiCallbacks: (() => void)[] = [];

function loadYouTubeAPI(cb: () => void) {
  if (typeof window === 'undefined') return;
  if (apiLoaded && window.YT?.Player) {
    cb();
    return;
  }
  apiCallbacks.push(cb);
  if (document.getElementById('yt-api')) return;

  window.onYouTubeIframeAPIReady = () => {
    apiLoaded = true;
    apiCallbacks.forEach((fn) => fn());
    apiCallbacks = [];
  };
  const tag = document.createElement('script');
  tag.id = 'yt-api';
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(
  ({ onReady, onError, onStateChange, hidden = true }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YT.Player | null>(null);
    const readyRef = useRef(false);

    const initPlayer = useCallback(() => {
      if (!containerRef.current || playerRef.current) return;

      playerRef.current = new window.YT.Player(containerRef.current, {
        height: '1',
        width: '1',
        videoId: '',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            onReady?.();
          },
          onError: (e: YT.OnErrorEvent) => {
            onError?.(e.data);
          },
          onStateChange: (e: YT.OnStateChangeEvent) => {
            onStateChange?.(e.data);
          },
        },
      });
    }, [onReady, onError, onStateChange]);

    useEffect(() => {
      loadYouTubeAPI(initPlayer);
      return () => {
        playerRef.current?.destroy();
        playerRef.current = null;
        readyRef.current = false;
      };
    }, [initPlayer]);

    useImperativeHandle(ref, () => ({
      loadVideo(videoId: string) {
        if (!readyRef.current || !playerRef.current) return;
        playerRef.current.cueVideoById({ videoId });
      },
      play() {
        if (!readyRef.current || !playerRef.current) return;
        playerRef.current.playVideo();
      },
      pause() {
        if (!readyRef.current || !playerRef.current) return;
        playerRef.current.pauseVideo();
      },
      stop() {
        if (!readyRef.current || !playerRef.current) return;
        playerRef.current.stopVideo();
      },
      seekTo(seconds: number) {
        if (!readyRef.current || !playerRef.current) return;
        playerRef.current.seekTo(seconds, true);
      },
      getCurrentTime() {
        if (!readyRef.current || !playerRef.current) return 0;
        return playerRef.current.getCurrentTime() || 0;
      },
      getPlayerState() {
        if (!readyRef.current || !playerRef.current) return -1;
        return playerRef.current.getPlayerState();
      },
    }));

    return (
      <div
        style={{
          position: hidden ? 'fixed' : 'relative',
          top: hidden ? '-9999px' : undefined,
          left: hidden ? '-9999px' : undefined,
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        <div ref={containerRef} />
      </div>
    );
  }
);

YouTubePlayer.displayName = 'YouTubePlayer';
export default YouTubePlayer;

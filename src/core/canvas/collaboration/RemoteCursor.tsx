import React, { useEffect, useRef } from 'react';

interface RemoteCursorProps {
  position: { x: number; y: number } | null;
  color?: string;
  label?: string;
}

export function RemoteCursor({ position, color = '#3b82f6', label = 'Remote User' }: RemoteCursorProps) {
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // console.log('🎯 RemoteCursor render - position:', position);

    if (!position || !cursorRef.current) {
      if (cursorRef.current) {
        cursorRef.current.style.opacity = '0';
      }
      return;
    }

    const cursor = cursorRef.current;
    cursor.style.opacity = '1';
    cursor.style.transform = `translate(${position.x}px, ${position.y}px)`;
    // console.log('✅ Cursor positioned at:', position);
  }, [position]);

  return (
    <div
      ref={cursorRef}
      className="fixed top-0 left-0 pointer-events-none z-50 transition-opacity duration-200"
      style={{ opacity: 0 }}
    >
      <div className="relative transition-transform duration-75 ease-out">
        {/* Cursor SVG */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M5.5 3.5L18.5 12.5L12 14L9.5 20.5L5.5 3.5Z"
            fill={color}
            stroke="white"
            strokeWidth="1.5"
          />
        </svg>

        {/* Label */}
        <div
          className="absolute left-6 -top-1 px-2 py-1 rounded text-xs text-white whitespace-nowrap shadow-lg"
          style={{ backgroundColor: color }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

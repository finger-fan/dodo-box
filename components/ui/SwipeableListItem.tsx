'use client';

import React, { useState, useRef } from 'react';
import { motion, useMotionValue, useTransform, useAnimation } from 'motion/react';
import { cn } from '@/lib/utils';

interface Action {
  label: string;
  onClick: () => void;
  className?: string;
}

interface SwipeableListItemProps {
  children: React.ReactNode;
  actions: Action[];
  className?: string;
}

export default function SwipeableListItem({ children, actions, className }: SwipeableListItemProps) {
  const x = useMotionValue(0);
  const controls = useAnimation();
  const actionsRef = useRef<HTMLDivElement>(null);
  
  // Calculate max swipe distance based on actions width
  const maxSwipe = actions.length * 80; // Assuming each button is roughly 80px
  
  const opacity = useTransform(x, [-maxSwipe, 0], [1, 0]);

  const handleDragEnd = (_: any, info: any) => {
    if (info.offset.x < -maxSwipe / 2) {
      controls.start({ x: -maxSwipe });
    } else {
      controls.start({ x: 0 });
    }
  };

  return (
    <div className={cn("relative overflow-hidden bg-white border-b border-zinc-100", className)}>
      {/* Actions Background */}
      <div 
        ref={actionsRef}
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: maxSwipe }}
      >
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
              controls.start({ x: 0 });
            }}
            className={cn(
              "flex-1 flex items-center justify-center text-xs font-medium text-white transition-colors px-4",
              action.className || "bg-zinc-500 hover:bg-zinc-600"
            )}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -maxSwipe, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ x }}
        className="relative z-10 bg-white cursor-grab active:cursor-grabbing"
      >
        {children}
      </motion.div>
    </div>
  );
}

'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  isVisible: boolean;
  onClose: () => void;
}

export default function Toast({ message, type = 'success', isVisible, onClose }: ToastProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] w-max max-w-[90vw]"
        >
          <div className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg border",
            type === 'success' && "bg-emerald-50 border-emerald-100 text-emerald-800",
            type === 'error' && "bg-red-50 border-red-100 text-red-800",
            type === 'info' && "bg-blue-50 border-blue-100 text-blue-800"
          )}>
            {type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
            {type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
            <span className="text-sm font-medium">{message}</span>
            <button onClick={onClose} className="ml-2 p-1 hover:bg-black/5 rounded-full transition-colors">
              <X className="w-4 h-4 opacity-50" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

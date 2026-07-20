'use client';

import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import Toast from '@/components/ui/Toast';
import IdentityForm from '@/components/settings/IdentityForm';
import { useNostr } from '@/contexts/NostrContext';

export default function IdentityOnboarding() {
  const { t } = useTranslation();
  const { logout } = useNostr();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6"
      data-testid="identity-onboarding"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-8"
      >
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-emerald-200 dark:shadow-none">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {t('settings.onboarding_title', 'Create your first identity')}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            {t('settings.onboarding_desc', 'You need an identity to start messaging')}
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl">
          <IdentityForm
            onSuccess={() => { /* layout gate clears once an identity is active */ }}
            onToast={(message, type) => setToast({ message, type })}
          />
        </div>

        <button
          onClick={logout}
          className="w-full text-center text-xs font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        >
          {t('common.logout')}
        </button>
      </motion.div>

      <Toast
        isVisible={!!toast}
        message={toast?.message || ''}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}

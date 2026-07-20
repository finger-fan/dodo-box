'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNostr } from '@/contexts/NostrContext';
import type { VaultIdentity } from '@/lib/nostr/types';

interface IdentityFormProps {
  /** When provided, the form edits this identity; otherwise it creates a new one. */
  readonly editingIdentity?: VaultIdentity | null;
  readonly onSuccess: () => void;
  readonly onToast: (message: string, type: 'success' | 'error') => void;
  /** When provided, a Cancel button is shown (dismissible dialog use). */
  readonly onCancel?: () => void;
  readonly autoFocus?: boolean;
}

export default function IdentityForm({
  editingIdentity,
  onSuccess,
  onToast,
  onCancel,
  autoFocus = true,
}: IdentityFormProps) {
  const { t } = useTranslation();
  const { createIdentity, updateIdentity } = useNostr();
  const isEditing = !!editingIdentity;

  const [name, setName] = useState(editingIdentity?.name ?? '');
  const [slogan, setSlogan] = useState(editingIdentity?.slogan ?? '');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || isLoading) return;
    setIsLoading(true);
    const result = isEditing
      ? await updateIdentity(editingIdentity!.pubkey, { name: trimmedName, slogan })
      : await createIdentity(trimmedName, slogan.trim());
    setIsLoading(false);
    if (result.success) {
      onToast(
        isEditing
          ? t('settings.identity_updated', 'Identity updated')
          : t('settings.new_identity_created', 'New identity created'),
        'success'
      );
      onSuccess();
    } else {
      onToast(result.error || (isEditing ? 'Update failed' : 'Failed to create'), 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-1">
          {t('settings.name')}
        </label>
        <input
          data-testid="identity-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={t('settings.name_placeholder', 'e.g. Work, Personal, Anon')}
          autoFocus={autoFocus}
          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-1">
          {t('settings.slogan', 'Slogan')}
        </label>
        <input
          data-testid="identity-slogan-input"
          type="text"
          value={slogan}
          onChange={(e) => setSlogan(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={t('settings.slogan_placeholder', 'A short tagline (optional)')}
          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
        />
      </div>
      <div className="flex gap-3 pt-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800"
          >
            {t('common.cancel')}
          </button>
        )}
        <button
          data-testid="identity-submit-btn"
          onClick={handleSubmit}
          disabled={!name.trim() || isLoading}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            isEditing ? t('common.save') : t('common.create', 'Create')
          )}
        </button>
      </div>
    </div>
  );
}

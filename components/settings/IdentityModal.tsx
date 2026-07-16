'use client';

import React, { useState } from 'react';
import {
  Shield, Share2, QrCode, Check, ChevronLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import SwipeableListItem from '@/components/ui/SwipeableListItem';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { cn, encodeIdentityInfo, shortPubkey } from '@/lib/utils';
import { useNostr } from '@/contexts/NostrContext';
import type { VaultIdentity } from '@/lib/nostr/types';

interface IdentityModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onToast: (message: string, type: 'success' | 'error') => void;
}

export default function IdentityModal({ isOpen, onClose, onToast }: IdentityModalProps) {
  const { t } = useTranslation();
  const { session, switchIdentity, createIdentity, deleteIdentity, updateIdentityName } = useNostr();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState<VaultIdentity | null>(null);
  const [newIdentityName, setNewIdentityName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const identities = session.vaultData?.identities || [];
  const activeIdentity = identities.find(i => i.pubkey === session.currentPubkey);

  const accountDisplay = session.username || t('settings.account_only', 'Account');

  const handleSwitchIdentity = async (pubkey: string) => {
    const result = await switchIdentity(pubkey);
    if (result.success) {
      onToast(t('settings.switched_identity'), 'success');
    } else {
      onToast(result.error || 'Switch failed', 'error');
    }
  };

  const handleDeleteIdentity = async (pubkey: string) => {
    const result = await deleteIdentity(pubkey);
    setConfirmDelete(null);
    if (result.success) {
      onToast(t('settings.identity_deleted'), 'success');
    } else {
      onToast(result.error || 'Delete failed', 'error');
    }
  };

  const handleCreateIdentity = async () => {
    if (!newIdentityName.trim()) return;
    setIsLoading(true);
    const result = await createIdentity(newIdentityName.trim());
    setIsLoading(false);
    if (result.success) {
      setNewIdentityName('');
      setIsEditModalOpen(false);
      onToast(t('settings.new_identity_created', 'New identity created'), 'success');
    } else {
      onToast(result.error || 'Failed to create', 'error');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingIdentity || !newIdentityName.trim()) return;
    setIsLoading(true);
    const result = await updateIdentityName(editingIdentity.pubkey, newIdentityName.trim());
    setIsLoading(false);
    if (result.success) {
      setEditingIdentity(null);
      setNewIdentityName('');
      setIsEditModalOpen(false);
      onToast(t('settings.identity_updated', 'Identity updated'), 'success');
    } else {
      onToast(result.error || 'Update failed', 'error');
    }
  };

  const handleCopyIdentity = (pubkey: string, nickname: string) => {
    const identityStr = encodeIdentityInfo(pubkey, nickname);
    navigator.clipboard.writeText(identityStr);
    onToast(t('common.copy_success', 'Identity copied for sharing'), 'success');
  };

  return (
    <>
      {/* Identity Management Full-screen Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col"
          >
            <header className="px-4 h-16 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <button onClick={onClose} className="p-2 -ml-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                  <ChevronLeft className="w-6 h-6 text-zinc-600 dark:text-zinc-400" />
                </button>
                <h2 className="header-title text-xl font-display font-bold text-zinc-900 dark:text-zinc-100">{t('settings.identities')}</h2>
              </div>
              <button
                onClick={() => {
                  setEditingIdentity(null);
                  setNewIdentityName('');
                  setIsEditModalOpen(true);
                }}
                className="btn-accent-pill bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg shadow-emerald-200 dark:shadow-none"
              >
                {t('common.new')}
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Active Hero */}
              <div className="identity-hero bg-emerald-600 rounded-[32px] p-6 text-white shadow-2xl shadow-emerald-200 dark:shadow-none relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                <div className="relative z-10 flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">
                      {t('settings.account_only', 'Account')}
                    </div>
                    <h3 className="identity-hero-name text-3xl font-display font-bold">{accountDisplay}</h3>
                    {activeIdentity && session.currentPubkey && (
                      <div className="text-xs opacity-60 mt-1">
                        {t('settings.active_identity')}: {activeIdentity.name} <span className="font-mono">{shortPubkey(session.currentPubkey)}</span>
                      </div>
                    )}
                    {!activeIdentity && (
                      <div className="text-xs opacity-60 mt-1">{t('settings.no_identity_hint', 'Create an identity to start messaging')}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Identity List */}
              {identities.length > 0 && (
                <div className="identity-list space-y-3">
                  <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">{t('settings.switch_identity')}</div>
                  {identities.map((identity) => {
                    const isActive = identity.pubkey === session.currentPubkey;
                    return (
                      <SwipeableListItem
                        key={identity.pubkey}
                        actions={[
                          {
                            label: t('common.edit'),
                            onClick: () => {
                              setEditingIdentity(identity);
                              setNewIdentityName(identity.name);
                              setIsEditModalOpen(true);
                            },
                            className: 'bg-zinc-400 dark:bg-zinc-600'
                          },
                          {
                            label: t('common.copy'),
                            onClick: () => handleCopyIdentity(identity.pubkey, identity.name),
                            className: 'bg-emerald-500'
                          },
                          {
                            label: t('common.delete'),
                            onClick: () => setConfirmDelete(identity.pubkey),
                            className: 'bg-red-500'
                          },
                        ]}
                        className="rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden"
                      >
                        <div
                          className={cn(
                            "w-full flex items-center gap-1 p-4 transition-all",
                            isActive ? "active bg-emerald-50/50 dark:bg-emerald-900/10" : "bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          )}
                        >
                          <button
                            onClick={() => handleSwitchIdentity(identity.pubkey)}
                            className="flex items-center gap-4 flex-1 min-w-0 text-left"
                          >
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0",
                              isActive ? "bg-emerald-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
                            )}>
                              <Shield className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <span className={cn("font-bold block", isActive ? "text-emerald-900 dark:text-emerald-400" : "text-zinc-600 dark:text-zinc-300")}>
                                {identity.name}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-400 truncate block">{shortPubkey(identity.pubkey)}</span>
                            </div>
                            {isActive && (
                              <div className="w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center shrink-0">
                                <Check className="w-3.5 h-3.5 text-white" />
                              </div>
                            )}
                          </button>
                          <button
                            onClick={() => handleCopyIdentity(identity.pubkey, identity.name)}
                            title={t('common.share', 'Share')}
                            className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors shrink-0"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                          <button
                            disabled
                            title={t('settings.coming_soon')}
                            className="p-2 text-zinc-300 dark:text-zinc-600 rounded-xl opacity-60 cursor-not-allowed shrink-0"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                        </div>
                      </SwipeableListItem>
                    );
                  })}
                </div>
              )}

              {identities.length === 0 && (
                <div className="text-center text-zinc-400 py-8">
                  <p className="text-sm">No identities yet. Create one to get started.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title={t('settings.delete_identity', 'Delete Identity')}
        message={t('settings.delete_confirm', 'Are you sure you want to delete this identity?')}
        onConfirm={() => confirmDelete && handleDeleteIdentity(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      {/* Identity Create/Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-xs bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl"
            >
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">
                {editingIdentity ? t('settings.edit_identity') : t('settings.new_identity')}
              </h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-1">{t('settings.name')}</label>
                  <input
                    type="text"
                    value={newIdentityName}
                    onChange={(e) => setNewIdentityName(e.target.value)}
                    placeholder="e.g. Work, Personal, Anon"
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setIsEditModalOpen(false); setEditingIdentity(null); setNewIdentityName(''); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={editingIdentity ? handleSaveEdit : handleCreateIdentity}
                  disabled={!newIdentityName.trim() || isLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-emerald-600 disabled:opacity-50"
                >
                  {isLoading ? '...' : (editingIdentity ? t('common.save') : t('common.create', 'Create'))}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

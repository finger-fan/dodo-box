'use client';

import React, { useState } from 'react';
import {
  Shield, Share2, QrCode, Check, ChevronLeft, Plus, Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import SwipeableListItem from '@/components/ui/SwipeableListItem';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import IdentityForm from '@/components/settings/IdentityForm';
import { cn, encodeIdentityInfo } from '@/lib/utils';
import { useNostr } from '@/contexts/NostrContext';
import type { VaultIdentity } from '@/lib/nostr/types';

interface IdentityModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onToast: (message: string, type: 'success' | 'error') => void;
}

export default function IdentityModal({ isOpen, onClose, onToast }: IdentityModalProps) {
  const { t } = useTranslation();
  const { session, switchIdentity, deleteIdentity, deleteAllIdentities } = useNostr();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState<VaultIdentity | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const identities = session.vaultData?.identities || [];

  const accountDisplay = session.username || t('settings.account_only', 'Account');

  const openCreate = () => {
    setEditingIdentity(null);
    setIsEditModalOpen(true);
  };

  const openEdit = (identity: VaultIdentity) => {
    setEditingIdentity(identity);
    setIsEditModalOpen(true);
  };

  const closeEdit = () => {
    setIsEditModalOpen(false);
    setEditingIdentity(null);
  };

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

  const handleDeleteAll = async () => {
    setConfirmDeleteAll(false);
    const result = await deleteAllIdentities();
    if (result.success) {
      onToast(t('settings.all_identities_deleted', 'All identities deleted'), 'success');
    } else {
      onToast(result.error || 'Delete failed', 'error');
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
            <header className="px-4 h-12 flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800">
              <button onClick={onClose} className="p-2 -ml-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <ChevronLeft className="w-6 h-6 text-zinc-600 dark:text-zinc-400" />
              </button>
              <h2 className="header-title text-xl font-display font-bold text-zinc-900 dark:text-zinc-100">{t('settings.identities')}</h2>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* De-emphasized account row */}
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800">
                <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                  {t('settings.account_only', 'Account')}
                </span>
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 truncate ml-3">
                  {accountDisplay}
                </span>
              </div>

              {/* Identity section */}
              <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                    {t('settings.identities')}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={openCreate}
                      className="flex items-center gap-1 bg-emerald-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow-sm hover:bg-emerald-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t('common.new')}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteAll(true)}
                      disabled={identities.length === 0}
                      className="flex items-center gap-1 bg-red-500 text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow-sm hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t('settings.delete_all_identities', 'Delete All')}
                    </button>
                  </div>
                </div>

                {identities.length > 0 ? (
                  <div className="identity-list space-y-3">
                    {identities.map((identity) => {
                      const isActive = identity.pubkey === session.currentPubkey;
                      return (
                        <SwipeableListItem
                          key={identity.pubkey}
                          actions={[
                            {
                              label: t('common.edit'),
                              onClick: () => openEdit(identity),
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
                                <span className={cn("font-bold block truncate", isActive ? "text-emerald-900 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-200")}>
                                  {identity.name}
                                </span>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate block">
                                  {identity.slogan || t('settings.no_slogan_hint', 'No slogan')}
                                </span>
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
                ) : (
                  <div className="text-center text-zinc-400 py-8">
                    <p className="text-sm">{t('settings.no_identity_hint', 'Create an identity to start messaging')}</p>
                  </div>
                )}
              </section>
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

      <ConfirmDialog
        isOpen={confirmDeleteAll}
        title={t('settings.delete_all_identities', 'Delete All')}
        message={t('settings.delete_all_confirm', 'Delete all identities? This cannot be undone.')}
        onConfirm={handleDeleteAll}
        onCancel={() => setConfirmDeleteAll(false)}
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
              onClick={closeEdit}
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
              <IdentityForm
                key={editingIdentity?.pubkey ?? 'create'}
                editingIdentity={editingIdentity}
                onSuccess={closeEdit}
                onCancel={closeEdit}
                onToast={onToast}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

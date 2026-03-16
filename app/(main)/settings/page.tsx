'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  UserCircle, LogOut, Globe, Moon, Shield, 
  Trash2, Download, ChevronRight, Plus, 
  Share2, QrCode, Edit2, X, Check, Clock, ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import SwipeableListItem from '@/components/ui/SwipeableListItem';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';
import { cn, encodeIdentityInfo } from '@/lib/utils';

interface Identity {
  id: string;
  name: string;
  active: boolean;
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const router = useRouter();
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState<Identity | null>(null);
  const [newIdentityName, setNewIdentityName] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [mounted, setMounted] = useState(false);
  
  const [identities, setIdentities] = useState<Identity[]>([
    { id: '1', name: 'default', active: true },
    { id: '2', name: 'work', active: false },
    { id: '3', name: 'anon', active: false },
  ]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      setMounted(true);
    });
  }, []);

  const activeIdentity = identities.find(i => i.active);

  const handleLogout = () => {
    localStorage.removeItem('doracle_account_active');
    localStorage.removeItem('doracle_current_user');
    router.push('/login');
  };

  const switchIdentity = (id: string) => {
    setIdentities(prev => prev.map(i => ({ ...i, active: i.id === id })));
    setToast({ message: `${t('settings.switch_identity')}: ${identities.find(i => i.id === id)?.name}`, type: 'success' });
  };

  const deleteIdentity = (id: string) => {
    const identity = identities.find(i => i.id === id);
    if (identity?.active) {
      setToast({ message: "Cannot delete active identity", type: 'error' });
      return;
    }
    setIdentities(prev => prev.filter(i => i.id !== id));
    setConfirmDelete(null);
    setToast({ message: "Identity deleted", type: 'success' });
  };

  const handleCreateIdentity = () => {
    if (!newIdentityName.trim()) return;
    const newId: Identity = {
      id: Date.now().toString(),
      name: newIdentityName,
      active: false
    };
    setIdentities(prev => [...prev, newId]);
    setNewIdentityName('');
    setGeneratedKey('');
    setIsEditModalOpen(false);
    setToast({ message: t('settings.new_identity_created', 'New identity created'), type: 'success' });
  };

  const handleSaveEdit = () => {
    if (!editingIdentity || !newIdentityName.trim()) return;
    setIdentities(prev => prev.map(i => i.id === editingIdentity.id ? { ...i, name: newIdentityName } : i));
    setEditingIdentity(null);
    setNewIdentityName('');
    setIsEditModalOpen(false);
    setToast({ message: t('settings.identity_updated', 'Identity name updated'), type: 'success' });
  };

  const handleCopyIdentity = (id: string) => {
    const identity = identities.find(i => i.id === id);
    if (identity) {
      const identityStr = encodeIdentityInfo(`mock_privkey_${identity.id}`);
      navigator.clipboard.writeText(identityStr);
      setToast({ message: t('common.copy_success', 'Identity copied for sharing'), type: 'success' });
    }
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800 px-4 h-16 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold text-zinc-900 dark:text-zinc-100">{t('common.settings')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Identity Section */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">{t('settings.identity_management')}</div>
          <button 
            onClick={() => setIsIdentityModalOpen(true)}
            className="w-full flex items-center gap-4 p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm hover:border-emerald-500 transition-all group"
          >
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <UserCircle className="w-7 h-7" />
            </div>
            <div className="text-left flex-1">
              <div className="font-bold text-zinc-900 dark:text-zinc-100">{activeIdentity?.name}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">{t('settings.switch_identity')}</div>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-emerald-500 transition-colors" />
          </button>
          
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-bold">{t('common.logout')}</span>
          </button>
        </section>

        {/* Preferences */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">{t('settings.preferences')}</div>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="lang-switcher flex items-center justify-between p-4 border-b border-zinc-50 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.language')}</span>
              </div>
              <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                <button 
                  onClick={() => handleLanguageChange('en')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-bold rounded shadow-sm transition-all",
                    i18n.language === 'en' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "text-zinc-400"
                  )}
                >
                  EN
                </button>
                <button 
                  onClick={() => handleLanguageChange('zh')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-bold rounded shadow-sm transition-all",
                    i18n.language === 'zh' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "text-zinc-400"
                  )}
                >
                  ZH
                </button>
              </div>
            </div>
            <div className="theme-menu flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Moon className="w-5 h-5 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.theme')}</span>
              </div>
              <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                <button 
                  onClick={() => setTheme('light')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-bold rounded shadow-sm transition-all",
                    resolvedTheme === 'light' && theme !== 'system' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "text-zinc-400"
                  )}
                >
                  {t('settings.light')}
                </button>
                <button 
                  onClick={() => setTheme('system')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-bold rounded shadow-sm transition-all",
                    theme === 'system' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "text-zinc-400"
                  )}
                >
                  {t('settings.system')}
                </button>
                <button 
                  onClick={() => setTheme('dark')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-bold rounded shadow-sm transition-all",
                    resolvedTheme === 'dark' && theme !== 'system' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "text-zinc-400"
                  )}
                >
                  {t('settings.dark')}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Network & Data */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">{t('settings.network_data')}</div>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="relay-list p-4 border-b border-zinc-50 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.relays')}</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded uppercase">3 Connected</span>
              </div>
              <div className="space-y-2">
                <div className="relay-item text-xs font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded-lg flex items-center justify-between">
                  <span>wss://relay.doracle.io</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </div>
              </div>
            </div>
            <div className="ttl-input-group p-4 border-b border-zinc-50 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.message_ttl')}</span>
              </div>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">30 Days</span>
            </div>
            <div className="p-4 flex gap-2">
              <button className="btn-secondary flex-1 flex items-center justify-center gap-2 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-xl text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                <Download className="w-4 h-4" /> {t('settings.export')}
              </button>
              <button className="btn-danger flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors">
                <Trash2 className="w-4 h-4" /> {t('settings.clear')}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Identity Management Full-screen Dialog */}
      <AnimatePresence>
        {isIdentityModalOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col"
          >
            <header className="px-4 h-16 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <button onClick={() => setIsIdentityModalOpen(false)} className="p-2 -ml-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                  <ChevronLeft className="w-6 h-6 text-zinc-600 dark:text-zinc-400" />
                </button>
                <h2 className="header-title text-xl font-display font-bold text-zinc-900 dark:text-zinc-100">{t('settings.identities')}</h2>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setEditingIdentity(null);
                    setNewIdentityName('');
                    setGeneratedKey(Math.random().toString(36).substring(7));
                    setIsEditModalOpen(true);
                  }}
                  className="btn-accent-pill bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg shadow-emerald-200 dark:shadow-none"
                >
                  {t('common.new')}
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Active Hero */}
              <div className="identity-hero bg-emerald-600 rounded-[32px] p-6 text-white shadow-2xl shadow-emerald-200 dark:shadow-none relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                <div className="relative z-10 flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">{t('settings.active_identity')}</div>
                    <h3 className="identity-hero-name text-3xl font-display font-bold">{activeIdentity?.name}</h3>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(encodeIdentityInfo('mock_privkey'));
                        setToast({ message: t('common.copy_success'), type: 'success' });
                      }}
                      className="p-3 bg-white/20 hover:bg-white/30 rounded-2xl backdrop-blur-md transition-colors"
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                    <button className="p-3 bg-white/20 hover:bg-white/30 rounded-2xl backdrop-blur-md transition-colors">
                      <QrCode className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Identity List */}
              <div className="identity-list space-y-3">
                <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">{t('settings.switch_identity')}</div>
                {identities.map((id) => (
                  <SwipeableListItem
                    key={id.id}
                    actions={[
                      { 
                        label: t('common.edit'), 
                        onClick: () => {
                          setEditingIdentity(id);
                          setNewIdentityName(id.name);
                          setIsEditModalOpen(true);
                        }, 
                        className: 'bg-zinc-400 dark:bg-zinc-600' 
                      },
                      { 
                        label: t('common.copy'), 
                        onClick: () => handleCopyIdentity(id.id), 
                        className: 'bg-emerald-500' 
                      },
                      { label: t('common.delete'), onClick: () => setConfirmDelete(id.id), className: 'bg-red-500' },
                    ]}
                    className="rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden"
                  >
                    <button
                      onClick={() => switchIdentity(id.id)}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 transition-all",
                        id.active ? "active bg-emerald-50/50 dark:bg-emerald-900/10" : "bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                        id.active ? "bg-emerald-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
                      )}>
                        <Shield className="w-5 h-5" />
                      </div>
                      <span className={cn("font-bold", id.active ? "text-emerald-900 dark:text-emerald-400" : "text-zinc-600 dark:text-zinc-300")}>
                        {id.name}
                      </span>
                      {id.active && (
                        <div className="ml-auto w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  </SwipeableListItem>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title={t('settings.delete_identity', 'Delete Identity')}
        message={t('settings.delete_confirm', 'Are you sure you want to delete this identity? All associated local data will be lost.')}
        onConfirm={() => confirmDelete && deleteIdentity(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      {/* Identity Edit/New Modal */}
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
                    placeholder="e.g. Work, Private"
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    autoFocus
                  />
                </div>
                {!editingIdentity && (
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700">
                    <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">{t('settings.generated_key')}</div>
                    <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 break-all opacity-50">
                      doracle_key_{generatedKey}...
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={editingIdentity ? handleSaveEdit : handleCreateIdentity}
                  disabled={!newIdentityName.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-emerald-600 disabled:opacity-50"
                >
                  {editingIdentity ? t('common.save') : t('common.new')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Toast
        isVisible={!!toast}
        message={toast?.message || ''}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, Plus, Camera, X, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import SwipeableListItem from '@/components/ui/SwipeableListItem';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';
import { useContacts } from '@/hooks/nostr/use-contacts';
import { useMounted } from '@/hooks/use-mounted';
import { defaultAvatar } from '@/lib/utils';

export default function ContactsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { contacts, isLoading, addContact, removeContact } = useContacts();
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [contactInput, setContactInput] = useState('');
  const [error, setError] = useState('');
  const mounted = useMounted();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleContactClick = (pubkey: string) => {
    router.push(`/messages/${pubkey}`);
  };

  const handleDelete = async (pubkey: string) => {
    const result = await removeContact(pubkey);
    setConfirmDelete(null);
    if (result.success) {
      setToast({ message: t('contacts.contact_removed', 'Contact removed'), type: 'success' });
    } else {
      setToast({ message: result.error || 'Failed to remove', type: 'error' });
    }
  };

  const handleAddContact = async () => {
    const input = contactInput.trim();
    if (!input) {
      setError('Please enter a contact string or npub');
      return;
    }

    // Accept dodobox://identity/ protocol, legacy dodobox://contact/, bare npub1, or hex pubkey
    if (!input.startsWith('dodobox://identity/') && !input.startsWith('dodobox://contact/') && !input.startsWith('npub1') && !input.match(/^[0-9a-f]{64}$/i)) {
      setError(t('contacts.invalid_protocol', 'Paste an identity sharing string'));
      return;
    }

    const result = await addContact(input);
    if (result.success) {
      setIsAddModalOpen(false);
      setContactInput('');
      setError('');
      setToast({ message: t('contacts.contact_added', 'Contact added successfully'), type: 'success' });
    } else {
      setError(result.error || 'Failed to add contact');
    }
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800 px-4 h-16 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold text-zinc-900 dark:text-zinc-100">{t('common.contacts')}</h1>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
        >
          <Plus className="w-6 h-6" />
        </button>
      </header>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('contacts.search_contacts')}
            className="search-input w-full pl-10 pr-10 py-2.5 bg-zinc-100 dark:bg-zinc-900 border-none rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:ring-2 focus:ring-emerald-500/20 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="search-clear absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
            >
              <X className="w-3 h-3 text-zinc-500" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="contacts-container flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-400 space-y-2">
            <p className="text-sm">{t('contacts.loading')}</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-400 space-y-2">
            <Users className="w-12 h-12 opacity-20" />
            <p className="text-sm">{t('contacts.no_contacts')}</p>
          </div>
        ) : (
          filteredContacts.map((contact) => (
            <SwipeableListItem
              key={contact.pubkey}
              actions={[
                { label: t('common.delete'), onClick: () => setConfirmDelete(contact.pubkey), className: 'bg-red-500' },
              ]}
            >
              <div
                onClick={() => handleContactClick(contact.pubkey)}
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
              >
                <div className="w-12 h-12 rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800 relative">
                  <Image
                    src={contact.avatar || defaultAvatar(contact.pubkey)}
                    alt={contact.name}
                    fill
                    className="object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{contact.name}</div>
                  <div className="text-xs text-zinc-400 truncate font-mono">
                    {contact.pubkey.slice(0, 16)}...
                  </div>
                </div>
              </div>
            </SwipeableListItem>
          ))
        )}
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title={t('contacts.remove_contact')}
        message={t('contacts.remove_confirm')}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      <Toast
        isVisible={!!toast}
        message={toast?.message || ''}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      {/* Add Contact Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="backdrop absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="modal-content relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t('contacts.add_contact')}</h2>
                <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="form-group space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase ml-1">Contact Identity String</label>
                  <div className="relative">
                    <textarea
                      value={contactInput}
                      onChange={(e) => {
                        setContactInput(e.target.value);
                        setError('');
                      }}
                      placeholder="dodobox://identity/npub1... or npub1..."
                      className="w-full h-32 px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-2xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none text-sm font-mono"
                    />
                    <button className="btn-cam absolute right-3 bottom-3 p-2 bg-white dark:bg-zinc-700 shadow-sm border border-zinc-100 dark:border-zinc-600 rounded-xl text-zinc-400 hover:text-emerald-600 transition-colors">
                      <Camera className="w-5 h-5" />
                    </button>
                  </div>
                  {error && <p className="text-xs text-red-500 ml-1">{error}</p>}
                </div>

                <button
                  onClick={handleAddContact}
                  className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-200 dark:shadow-none hover:bg-emerald-700 transition-all active:scale-[0.98]"
                >
                  {t('contacts.add_contact')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

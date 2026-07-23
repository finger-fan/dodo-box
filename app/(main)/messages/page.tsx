'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import SwipeableListItem from '@/components/ui/SwipeableListItem';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';
import AddContactModal from '@/components/contacts/AddContactModal';
import { useChats } from '@/hooks/nostr/use-chats';
import { useNostr } from '@/contexts/NostrContext';
import { useMounted } from '@/hooks/use-mounted';

export default function MessagesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { chats, isLoading, refresh } = useChats();
  const { adapter } = useNostr();
  const mounted = useMounted();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleDelete = async (pubkey: string) => {
    setConfirmDelete(null);
    const result = await adapter.removeContact(pubkey);
    if (result.success) {
      refresh();
      setToast({ message: t('contacts.contact_removed', 'Contact removed'), type: 'success' });
    } else {
      setToast({ message: result.error || 'Failed to remove', type: 'error' });
    }
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950">
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800 px-4 h-12 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold text-zinc-900 dark:text-zinc-100">{t('common.contacts')}</h1>
        <button
          data-testid="add-contact-btn"
          onClick={() => setIsAddModalOpen(true)}
          className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
        >
          <Plus className="w-6 h-6" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center">
            <p className="text-sm text-zinc-400">{t('messages.loading_chats')}</p>
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center space-y-4">
            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center">
              <Search className="w-8 h-8 text-zinc-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{t('messages.no_chats')}</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{t('messages.add_contact_prompt')}</p>
            </div>
          </div>
        ) : (
          chats.map((chat) => (
            <SwipeableListItem
              key={chat.pubkey}
              actions={[
                { label: t('common.delete'), onClick: () => setConfirmDelete(chat.pubkey), className: 'bg-red-500' },
              ]}
            >
              <button
                data-testid="chat-item"
                onClick={() => router.push(`/chat?peer=${chat.pubkey}`)}
                className="w-full flex items-center gap-4 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
              >
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800 relative">
                    <Image src={chat.avatar} alt="" fill className="object-cover" referrerPolicy="no-referrer" />
                  </div>
                  {chat.unread > 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white dark:border-zinc-950">
                      {chat.unread}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">{chat.name}</span>
                    <span className="text-[10px] font-medium text-zinc-400">{chat.time}</span>
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{chat.lastMsg}</p>
                </div>
              </button>
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

      <AddContactModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdded={() => {
          refresh();
          setToast({ message: t('contacts.contact_added', 'Contact added successfully'), type: 'success' });
        }}
      />
    </div>
  );
}

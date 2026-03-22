'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Image from 'next/image';
import { 
  Compass,
  Hash,
  Settings2,
  Search, 
  Check, 
  MoreHorizontal,
  Heart,
  MessageCircle,
  Share2,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useMounted } from '@/hooks/use-mounted';

interface Channel {
  id: string;
  name: string;
  description: string;
  isSubscribed: boolean;
}

interface Post {
  id: string;
  author: {
    name: string;
    avatar: string;
    handle: string;
  };
  content: string;
  timestamp: string;
  channelId: string;
  likes: number;
  comments: number;
}

export default function DiscoverPage() {
  const { t } = useTranslation();
  const [activeChannelId, setActiveChannelId] = useState<string>('all');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const mounted = useMounted();

  if (!mounted) return null;

  const subscribedChannels = channels.filter(c => c.isSubscribed);
  const posts: Post[] = [];
  const filteredPosts = activeChannelId === 'all'
    ? posts.filter(p => channels.find(c => c.id === p.channelId)?.isSubscribed)
    : posts.filter(p => p.channelId === activeChannelId);

  const toggleSubscription = (id: string) => {
    setChannels(prev => prev.map(c => 
      c.id === id ? { ...c, isSubscribed: !c.isSubscribed } : c
    ));
  };

  const filteredChannels = channels.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          <h1 className="text-xl font-display font-bold text-zinc-900 dark:text-zinc-100">{t('discover.title')}</h1>
        </div>
        <button 
          onClick={() => setIsManageModalOpen(true)}
          className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-500"
        >
          <Settings2 className="w-5 h-5" />
        </button>
      </header>

      {/* Channel Tabs */}
      <div className="bg-white dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800 overflow-x-auto no-scrollbar">
        <div className="flex px-4 py-3 gap-2 min-w-max">
          <button
            onClick={() => setActiveChannelId('all')}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
              activeChannelId === 'all'
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200 dark:shadow-none"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
            )}
          >
            {t('discover.all_posts')}
          </button>
          {subscribedChannels.map(channel => (
            <button
              key={channel.id}
              onClick={() => setActiveChannelId(channel.id)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5",
                activeChannelId === channel.id
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200 dark:shadow-none"
                  : "bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
              )}
            >
              <Hash className="w-3 h-3 opacity-60" />
              {channel.name}
            </button>
          ))}
        </div>
      </div>

      {/* Posts Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredPosts.length > 0 ? (
          filteredPosts.map(post => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={post.id} 
              className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800 shadow-sm"
            >
              <div className="flex gap-3">
                <div className="relative w-10 h-10 flex-shrink-0">
                  <Image 
                    src={post.author.avatar} 
                    alt={post.author.name} 
                    fill 
                    className="rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">{post.author.name}</span>
                      <span className="text-xs text-zinc-500 truncate">@{post.author.handle}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400">{post.timestamp}</span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                    {post.content}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-zinc-400">
                    <button className="flex items-center gap-1.5 hover:text-emerald-500 transition-colors">
                      <Heart className="w-4 h-4" />
                      <span className="text-xs">{post.likes}</span>
                    </button>
                    <button className="flex items-center gap-1.5 hover:text-emerald-500 transition-colors">
                      <MessageCircle className="w-4 h-4" />
                      <span className="text-xs">{post.comments}</span>
                    </button>
                    <button className="hover:text-emerald-500 transition-colors">
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button className="hover:text-emerald-500 transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center text-zinc-300 dark:text-zinc-700">
              <Compass className="w-8 h-8" />
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">{t('discover.no_posts')}</p>
          </div>
        )}
      </div>

      {/* Manage Channels Modal */}
      <AnimatePresence>
        {isManageModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManageModalOpen(false)}
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{t('discover.manage_channels')}</h2>
                <button 
                  onClick={() => setIsManageModalOpen(false)}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('discover.search_channels')}
                    className="w-full pl-10 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {filteredChannels.map(channel => (
                  <div 
                    key={channel.id}
                    className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                        <Hash className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{channel.name}</div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{channel.description}</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => toggleSubscription(channel.id)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-[10px] font-bold transition-all",
                        channel.isSubscribed
                          ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                          : "bg-emerald-600 text-white shadow-lg shadow-emerald-200 dark:shadow-none"
                      )}
                    >
                      {channel.isSubscribed ? t('discover.unsubscribe') : t('discover.subscribe')}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

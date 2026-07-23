import { Suspense } from 'react';
import ChatView from './chat-view';

// useSearchParams 在静态导出下必须包在 Suspense 里
export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatView />
    </Suspense>
  );
}

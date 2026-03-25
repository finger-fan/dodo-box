import ChatView from './chat-view';

export function generateStaticParams() {
  return [{ id: '__placeholder__' }];
}

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  return <ChatView params={params} />;
}

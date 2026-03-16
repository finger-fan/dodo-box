export interface Message {
  id: string;
  text: string;
  sender: 'me' | 'them';
  timestamp: Date;
}

export const MOCK_CHATS = [
  { id: '1', name: 'Alice', lastMsg: 'See you tomorrow!', time: '10:30 AM', unread: 2, avatar: 'https://picsum.photos/seed/alice/100/100' },
  { id: '2', name: 'Bob', lastMsg: 'Did you check the relay?', time: 'Yesterday', unread: 0, avatar: 'https://picsum.photos/seed/bob/100/100' },
  { id: '3', name: 'Charlie', lastMsg: 'The protocol is working.', time: 'Monday', unread: 0, avatar: 'https://picsum.photos/seed/charlie/100/100' },
];

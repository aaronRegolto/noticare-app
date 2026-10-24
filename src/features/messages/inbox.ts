import type { HistorySummary } from '@/src/services/notificationListener';
import type { MessageCategory } from './categories';

export type MessageFilter = 'all' | 'unread' | 'safe' | 'suspicious' | 'dangerous' | 'blocked';
export type MessageCategoryFilter = 'all' | MessageCategory;
export const isMessageBlocked = (record: HistorySummary) => record.blocked ?? true;
export const messageSender = (record: HistorySummary) => record.sender || record.maskedSender || 'Unknown sender';

export function filterMessages(
  records: HistorySummary[],
  filter: MessageFilter,
  query: string,
  categoryFilter: MessageCategoryFilter = 'all',
) {
  const search = query.trim().toLocaleLowerCase();
  return records
    .filter((record) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'unread'
          ? !record.isRead
          : filter === 'blocked'
            ? isMessageBlocked(record)
            : record.level === filter);
      const searchable = `${messageSender(record)} ${record.preview ?? record.redactedPreview}`.toLocaleLowerCase();
      const matchesCategory = categoryFilter === 'all' || record.categories?.includes(categoryFilter);
      return matchesFilter && matchesCategory && (!search || searchable.includes(search));
    })
    .sort((a, b) => b.receivedAt - a.receivedAt);
}

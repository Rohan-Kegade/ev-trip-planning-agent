// Chats opened in this tab, kept in memory so switching back to one shows it at once
// (it still refreshes from the server). Cleared on logout; never written to storage.
const cache = new Map();

export const getCachedConversation = (id) => cache.get(id) ?? null;

export const cacheConversation = (id, data) => {
  cache.set(id, data);
};

export const forgetConversation = (id) => {
  cache.delete(id);
};

export const clearConversationCache = () => {
  cache.clear();
};

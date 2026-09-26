import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { streamStatusQueryKey } from '~/data-provider';

const FOREGROUND_SYNC_INTERVAL_MS = 4_000;
const FOREGROUND_SYNC_MAX_ATTEMPTS = 30;

/**
 * Reconcile a conversation from durable server state after a browser suspension.
 *
 * This deliberately lives above the SSE transport choice. Mobile Safari can freeze
 * either legacy SSE or a resumable agent stream while the server continues running,
 * persists content parts, and finishes the response. Refetching only inside a transport
 * misses cases where that transport already marked itself final or lost its lifecycle
 * callbacks while frozen.
 */
export default function useForegroundConversationSync(
  conversationId: string | undefined,
  isSubmitting: boolean,
) {
  const queryClient = useQueryClient();
  const isSubmittingRef = useRef(isSubmitting);
  const conversationIdRef = useRef(conversationId);
  const wasBackgroundedRef = useRef(document.visibilityState !== 'visible');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const syncInFlightRef = useRef(false);

  isSubmittingRef.current = isSubmitting;
  conversationIdRef.current = conversationId;

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const syncDurableConversation = useCallback(async () => {
    const activeConversationId = conversationIdRef.current;
    if (
      syncInFlightRef.current ||
      document.visibilityState !== 'visible' ||
      !activeConversationId ||
      activeConversationId === Constants.NEW_CONVO ||
      activeConversationId === Constants.SEARCH
    ) {
      return;
    }

    syncInFlightRef.current = true;
    attemptRef.current += 1;
    try {
      await Promise.allSettled([
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.messages, activeConversationId],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.conversation, activeConversationId],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: streamStatusQueryKey(activeConversationId),
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.activeJobs],
          refetchType: 'all',
        }),
      ]);
    } finally {
      syncInFlightRef.current = false;
    }

    /**
     * A phone may return before the server finishes. Keep re-reading durable state
     * while the composer still considers the turn active, so a later persisted final
     * answer appears even when no transport event survives the suspension.
     */
    if (
      isSubmittingRef.current &&
      document.visibilityState === 'visible' &&
      attemptRef.current < FOREGROUND_SYNC_MAX_ATTEMPTS
    ) {
      clearTimer();
      timerRef.current = setTimeout(
        () => void syncDurableConversation(),
        FOREGROUND_SYNC_INTERVAL_MS,
      );
    }
  }, [clearTimer, queryClient]);

  const startForegroundSync = useCallback(() => {
    if (document.visibilityState !== 'visible') {
      wasBackgroundedRef.current = true;
      return;
    }
    clearTimer();
    attemptRef.current = 0;
    wasBackgroundedRef.current = false;
    void syncDurableConversation();
  }, [clearTimer, syncDurableConversation]);

  useEffect(() => {
    if (!isSubmitting) {
      clearTimer();
    }
  }, [clearTimer, isSubmitting]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        wasBackgroundedRef.current = true;
        clearTimer();
        return;
      }
      if (wasBackgroundedRef.current) {
        startForegroundSync();
      }
    };
    const handlePageHide = () => {
      wasBackgroundedRef.current = true;
      clearTimer();
    };
    /** `pageshow` and `online` are independent recovery signals on iOS. Safari
     * can restore a frozen page without delivering the expected visibility edge. */
    const handlePageShow = () => startForegroundSync();
    const handleOnline = () => startForegroundSync();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handleOnline);
    return () => {
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
    };
  }, [clearTimer, startForegroundSync]);
}


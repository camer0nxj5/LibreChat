import { useCallback, useEffect, useRef, useId } from 'react';
import { v4 } from 'uuid';
import { useSetAtom, useStore } from 'jotai';
import { useMutation } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import type { TConversation, RouteChoice, RouteDecision } from 'librechat-data-provider';
import type { TAskFunction } from '~/common';
import { useGetStartupConfig } from '~/data-provider';
import { routingStateFamily } from './state';

/** Holds the send before it consumes drafts, attachments, or generation state. */
export default function useRouting(
  send: TAskFunction,
  conversation: TConversation | null,
  index: number,
  host: { googleTools?: boolean; currentSources?: boolean; selectModel?: (model: string) => void } = {},
) {
  const setState = useSetAtom(routingStateFamily(index));
  const owner = useId();
  const store = useStore();
  const clear = useCallback(
    () => setState((state) => (state?.owner === owner ? null : state)),
    [owner, setState],
  );
  const { mutateAsync: assess } = useMutation({ mutationFn: dataService.assessCJRoute });
  const { data: startupConfig } = useGetStartupConfig();
  const active = useRef(0);
  const pending = useRef(false);
  const current = useRef({ send, conversation, startupConfig, host });
  current.current = { send, conversation, startupConfig, host };
  useEffect(() => {
    active.current++;
    pending.current = false;
    clear();
    return () => {
      active.current++;
      pending.current = false;
      clear();
    };
  }, [conversation?.conversationId, conversation?.endpoint, conversation?.model, clear]);

  return useCallback<TAskFunction>(
    (props, options = {}) => {
      if (options.cjRouteDecision) {
        return current.current.send(props, options);
      }
      if (pending.current || store.get(routingStateFamily(index))) {
        return false;
      }
      const convo = current.current.conversation;
      const settings = current.current.startupConfig?.cjRouting;
      if (
        (current.current.startupConfig && settings?.enabled !== true) ||
        (settings && !settings.localEndpoints.includes(convo?.endpoint ?? '')) ||
        !convo?.endpoint ||
        !convo.model ||
        convo.endpoint === 'agents' ||
        options.compact
      ) {
        return current.current.send(props, options);
      }
      const generation = ++active.current;
      pending.current = true;
      const requestId = options.overrideClientRequestId ?? v4();
      const input = {
        text: props.text.trim(),
        endpoint: convo.endpoint,
        model: convo.model,
        conversationId: props.conversationId ?? convo.conversationId ?? null,
        requestId,
        ...(current.current.host.googleTools === true ? { googleTools: true } : {}),
        ...(current.current.host.currentSources === true ? { currentSources: true } : {}),
      };
      const cancel = () => {
        if (active.current !== generation) {
          return;
        }
        active.current++;
        pending.current = false;
        clear();
      };
      const dispatch = (decision?: RouteDecision, routeModel?: string) => {
        if (active.current !== generation) {
          return;
        }
        active.current++;
        pending.current = false;
        clear();
        const result = current.current.send(props, {
          ...options,
          overrideClientRequestId: requestId,
          cjRouteDecision: decision,
        });
        if (result !== false) {
          if (routeModel) current.current.host.selectModel?.(routeModel);
          options.onCJRouteSubmitted?.();
        }
      };
      const run = async () => {
        setState({ owner, phase: 'checking', choose: () => {}, cancel, retry: () => void run() });
        try {
          const { card } = await assess(input);
          if (active.current !== generation) {
            return;
          }
          if (!card) {
            dispatch();
            return;
          }
          const choose = (action: RouteChoice) => {
            if (card.expiresAt * 1000 <= Date.now()) {
              void run();
              return;
            }
            dispatch({ token: card.token, action }, String(convo.endpoint) === "ClawiQ" ? (action === "local" ? "clawiq/local" : "clawiq/" + card.actions.find((item) => item.id === action)!.label) : undefined);
          };
          setState({ owner, phase: 'choice', card, choose, cancel, retry: () => void run() });
        } catch {
          if (active.current === generation) {
            setState({ owner, phase: 'error', choose: () => {}, cancel, retry: () => void run() });
          }
        }
      };
      void run();
      return false;
    },
    [assess, setState, clear, index, owner, store],
  );
}

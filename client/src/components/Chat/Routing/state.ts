import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { RouteCard, RouteChoice } from 'librechat-data-provider';

export type RoutingState = {
  owner: string;
  phase: 'checking' | 'choice' | 'error';
  card?: RouteCard;
  choose: (choice: RouteChoice) => void;
  cancel: () => void;
  retry: () => void;
};
export const routingStateFamily = atomFamily((_index: number) => atom<RoutingState | null>(null));

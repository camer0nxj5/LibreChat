import { useAtomValue } from 'jotai';
import { Button } from '@librechat/client';
import useLocalize from '~/hooks/useLocalize';
import { routingStateFamily } from './state';
import ActionCard from '../Actions/Card';

export default function RoutingCard({ index }: { index: number }) {
  const state = useAtomValue(routingStateFamily(index));
  const localize = useLocalize();
  if (!state) {
    return null;
  }
  return (
    <div data-chat-action-card="true">
      <ActionCard
        title={localize('com_ui_cj_route_title')}
        message={
          state.phase === 'checking'
            ? localize('com_ui_cj_route_checking')
            : state.phase === 'error'
              ? localize('com_ui_cj_route_error')
              : (state.card?.message ?? '')
        }
        actions={state.phase === 'choice' ? (state.card?.actions ?? []) : []}
        onAction={state.choose}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {state.phase === 'error' && (
          <Button type="button" variant="outline" onClick={state.retry}>
            {localize('com_ui_retry')}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={state.cancel}>
          {localize('com_ui_cancel')}
        </Button>
      </div>
    </div>
  );
}

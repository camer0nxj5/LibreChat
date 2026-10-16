import React, { useState } from 'react';
import axios from 'axios';
import { Provider } from 'jotai';
import { RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil';
import recoilStore from '~/store';
import { EModelEndpoint } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { RouteAssessment, TConversation } from 'librechat-data-provider';
import type { TAskFunction } from '~/common';
import useRouting from '../useRouting';
import RoutingCard from '../Card';

let mockEnabled = true;
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({
    data: { cjRouting: { enabled: mockEnabled, localEndpoints: ['custom', 'ClawiQ'] } },
  }),
}));
jest.mock('~/hooks/useLocalize', () => () => (key: string) => key);

let conversation: TConversation = {
  conversationId: 'c1',
  endpoint: EModelEndpoint.custom,
  model: 'qwen',
  title: 'Test',
  createdAt: '',
  updatedAt: '',
};
const card: NonNullable<RouteAssessment['card']> = {
  version: 1,
  id: 'c',
  expiresAt: Math.floor(Date.now() / 1000) + 600,
  message: 'This ask appears to involve coding.',
  token: 'signed.token',
  categories: ['coding'],
  actions: [
    { id: 'local', label: 'Continue with Local' },
    { id: 'fireworks', label: 'Kimi K3' },
    { id: 'chatgpt', label: 'GPT' },
  ],
};

function Selection() {
  const selected = useRecoilValue(recoilStore.conversationByIndex(0));
  return <output data-testid="selected-route">{selected?.model}</output>;
}

function Sibling() {
  useRouting(() => {}, conversation, 0);
  return null;
}

function Harness({ send, onSubmitted }: { send: TAskFunction; onSubmitted: () => void }) {
  const setConversation = useSetRecoilState(recoilStore.conversationByIndex(0));
  const ask = useRouting(send, conversation, 0, {selectModel: (model) => setConversation((previous) => previous ? {...previous, model, spec: undefined} : previous)});
  const [sibling, setSibling] = useState(false);
  return (
    <>
      <button onClick={() => ask({ text: 'Fix Python code' }, { onCJRouteSubmitted: onSubmitted })}>
        Send
      </button>
      <button onClick={() => setSibling(true)}>Mount sidebar</button>
      {sibling && <Sibling />}
      <RoutingCard index={0} /><Selection />
    </>
  );
}
function setup(send = jest.fn(), onSubmitted = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <RecoilRoot initializeState={({ set }) => set(recoilStore.conversationByIndex(0), conversation)}><Provider>
        <Harness send={send} onSubmitted={onSubmitted} />
      </Provider></RecoilRoot>
    </QueryClientProvider>,
  );
  return { ...view, send, onSubmitted };
}

beforeEach(() => {
  mockEnabled = true;
});
afterEach(() => jest.restoreAllMocks());

it.each(['Continue with Local', 'Kimi K3', 'GPT'])(
  'holds generation and forwards the original request once for %s',
  async (label) => {
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { card } });
    const { send, onSubmitted } = setup();
    fireEvent.click(screen.getByText('Send'));
    const choice = await screen.findByRole('button', { name: label });
    expect(send).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
    fireEvent.click(choice);
    fireEvent.click(choice);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({ text: 'Fix Python code' });
    expect(send.mock.calls[0][1].cjRouteDecision).toEqual({
      token: card.token,
      action: card.actions.find((a) => a.label === label)?.id,
    });
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  },
);

it('passes nonmatching tasks after assessment', async () => {
  jest.spyOn(axios, 'post').mockResolvedValue({ data: { card: null } });
  const { send } = setup();
  fireEvent.click(screen.getByText('Send'));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
});

it('keeps immediate existing behavior when disabled', () => {
  mockEnabled = false;
  const assess = jest.spyOn(axios, 'post');
  const { send } = setup();
  fireEvent.click(screen.getByText('Send'));
  expect(send).toHaveBeenCalledTimes(1);
  expect(assess).not.toHaveBeenCalled();
});

it('supports cancel without sending or consuming the draft', async () => {
  jest.spyOn(axios, 'post').mockResolvedValue({ data: { card } });
  const { send, onSubmitted } = setup();
  fireEvent.click(screen.getByText('Send'));
  await screen.findByRole('button', { name: 'Kimi K3' });
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_cancel' }));
  expect(send).not.toHaveBeenCalled();
  expect(onSubmitted).not.toHaveBeenCalled();
});

it('shows failure and retries without sending prematurely', async () => {
  jest
    .spyOn(axios, 'post')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ data: { card } });
  const { send } = setup();
  fireEvent.click(screen.getByText('Send'));
  const retry = await screen.findByRole('button', { name: 'com_ui_retry' });
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(retry);
  await screen.findByRole('button', { name: 'Kimi K3' });
  expect(send).not.toHaveBeenCalled();
});

it('ignores a late preflight after cancellation', async () => {
  let resolve: (value: RouteAssessment) => void = () => {};
  jest.spyOn(axios, 'post').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = (value) => done({ data: value });
      }),
  );
  const { send } = setup();
  fireEvent.click(screen.getByText('Send'));
  await waitFor(() => expect(axios.post).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_cancel' }));
  await act(async () => {
    resolve({ card: null });
  });
  expect(send).not.toHaveBeenCalled();
});

it('does not let a second chat helper dismiss another helper’s pending card', async () => {
  jest.spyOn(axios, 'post').mockResolvedValue({ data: { card } });
  const { send } = setup();
  fireEvent.click(screen.getByText('Send'));
  await screen.findByRole('button', { name: 'Kimi K3' });
  fireEvent.click(screen.getByText('Mount sidebar'));
  fireEvent.click(screen.getByRole('button', { name: 'Kimi K3' }));
  expect(send).toHaveBeenCalledTimes(1);
});

it('changes the selected ClawiQ model after a cloud card choice and keeps the original signed ask', async () => {
  const original = conversation;
  conversation = {...conversation, endpoint: 'ClawiQ' as EModelEndpoint, model: 'clawiq/local'};
  try {
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { card } });
    const { send } = setup();
    fireEvent.click(screen.getByText('Send'));
    fireEvent.click(await screen.findByRole('button', {name: 'Kimi K3'}));
    expect(screen.getByTestId('selected-route')).toHaveTextContent('clawiq/Kimi K3');
    expect(send.mock.calls[0][1].cjRouteDecision.action).toBe('fireworks');
    expect(send).toHaveBeenCalledTimes(1);
  } finally { conversation = original; }
});

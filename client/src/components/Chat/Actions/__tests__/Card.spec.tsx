import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionCard from '../Card';

describe('generic action card', () => {
  it('renders provider text literally and emits only the selected action ID', () => {
    const onAction = jest.fn();
    const onSubmit = jest.fn();
    const { container } = render(
      <form onSubmit={onSubmit}>
        <ActionCard
          title="Routing"
          message={'<img src=x onerror="alert(1)">'}
          actions={[
            { id: 'local', label: 'Continue with Local' },
            { id: 'cloud', label: '<script>evil</script>' },
          ]}
          onAction={onAction}
        />
      </form>,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '<script>evil</script>' }));
    expect(onAction).toHaveBeenCalledWith('cloud');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('honors disabled actions', () => {
    const onAction = jest.fn();
    render(
      <ActionCard
        title="Routing"
        message="Choose"
        actions={[{ id: 'local', label: 'Local' }]}
        disabled
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Local' }));
    expect(onAction).not.toHaveBeenCalled();
  });
});

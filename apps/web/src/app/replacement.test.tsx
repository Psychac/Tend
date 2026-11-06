import { fireEvent, screen, within } from '@testing-library/react';
import { renderApp } from './test-utils';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T06:30:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('replacement planning', () => {
  it('shows an asset past its expected life and its condition', async () => {
    const { user } = renderApp('/assets');
    await user.click(await screen.findByRole('button', { name: 'Add asset' }));
    await user.type(screen.getByLabelText('Name'), 'Water heater');
    fireEvent.change(screen.getByLabelText('Purchase date'), { target: { value: '2015-01-01' } });
    await user.type(screen.getByLabelText('Expected life (years)'), '10');
    await user.selectOptions(screen.getByLabelText('Condition'), 'fair');
    await user.click(screen.getByRole('button', { name: 'Save asset' }));

    const plan = await screen.findByRole('region', { name: 'Replacement planning' });
    expect(within(plan).getByText('Water heater')).toBeInTheDocument();
    expect(within(plan).getByText(/past its expected life/)).toBeInTheDocument();
    expect(screen.getByText(/fair condition/)).toBeInTheDocument();
  });

  it('has no planning section when nothing needs replacing', async () => {
    const { user } = renderApp('/assets');
    await user.click(await screen.findByRole('button', { name: 'Add asset' }));
    await user.type(screen.getByLabelText('Name'), 'Kettle');
    await user.click(screen.getByRole('button', { name: 'Save asset' }));
    await screen.findByText('Kettle');
    expect(screen.queryByRole('region', { name: 'Replacement planning' })).not.toBeInTheDocument();
  });
});

describe('dashboard asset alerts', () => {
  it('shows a warranty that is about to end, and nothing otherwise', async () => {
    const { user } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Needs attention' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Assets' }));
    await user.click(await screen.findByRole('button', { name: 'Add asset' }));
    await user.type(screen.getByLabelText('Name'), 'Television');
    fireEvent.change(screen.getByLabelText('Warranty ends'), { target: { value: '2026-11-20' } });
    await user.click(screen.getByRole('button', { name: 'Save asset' }));
    await screen.findByText('Television', { selector: 'p' });

    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    const section = await screen.findByRole('region', { name: 'Needs attention' });
    expect(section).toHaveTextContent('Television');
    expect(section).toHaveTextContent('Warranty ends in 15 days');
  });
});

describe('readings history', () => {
  it('records a number and a rating, then shows both histories', async () => {
    const { user } = renderApp('/assets');
    await user.click(await screen.findByRole('button', { name: 'Add asset' }));
    await user.type(screen.getByLabelText('Name'), 'Pool');
    await user.click(screen.getByRole('button', { name: 'Save asset' }));
    await screen.findByText('Pool', { selector: 'p' });

    const record = async (fill: () => Promise<void>) => {
      await user.click(screen.getByRole('button', { name: 'Record a reading' }));
      const form = await screen.findByRole('form', { name: 'Reading for Pool' });
      await fill();
      await user.click(within(form).getByRole('button', { name: 'Save reading' }));
      await screen.findByRole('button', { name: 'Record a reading' });
    };
    const meter = () => screen.getByLabelText('Meter');
    await record(async () => {
      await user.clear(meter());
      await user.type(meter(), 'pH');
      await user.type(screen.getByLabelText('Value'), '7.2');
      await user.clear(screen.getByLabelText('Unit'));
      await user.type(screen.getByLabelText('Unit'), 'pH');
    });
    await record(async () => {
      await user.selectOptions(screen.getByLabelText('Kind'), 'qualitative');
      await user.clear(meter());
      await user.type(meter(), 'clarity');
      await user.type(screen.getByLabelText('Rating'), 'Cloudy');
    });

    await user.click(screen.getByRole('button', { name: 'Readings history for Pool' }));
    const region = await screen.findByRole('region', { name: 'Readings for Pool' });
    expect(await within(region).findByRole('region', { name: 'pH history' })).toBeInTheDocument();
    expect(within(region).getByRole('img', { name: /pH from 7.2 to 7.2/ })).toBeInTheDocument();
    expect(within(region).getByRole('region', { name: 'clarity history' })).toHaveTextContent(
      'Cloudy',
    );
  });

  it('says so when there are no readings', async () => {
    const { user } = renderApp('/assets');
    await user.click(await screen.findByRole('button', { name: 'Add asset' }));
    await user.type(screen.getByLabelText('Name'), 'Lamp');
    await user.click(screen.getByRole('button', { name: 'Save asset' }));
    await screen.findByText('Lamp', { selector: 'p' });
    await user.click(screen.getByRole('button', { name: 'Readings history for Lamp' }));
    expect(await screen.findByText(/No readings yet/)).toBeInTheDocument();
  });
});

import { screen } from '@testing-library/react';
import { renderApp } from './test-utils';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T06:30:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('digital upkeep', () => {
  it('starts empty and offers presets', async () => {
    renderApp('/digital');
    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Backup check' })).toHaveAttribute(
      'href',
      '/activities/new?preset=backup',
    );
  });

  it('prefills the form from a preset and files the result under Digital', async () => {
    const { user } = renderApp('/activities/new?preset=security');
    expect(await screen.findByLabelText('Name')).toHaveValue('Security review');
    expect(screen.getByLabelText('Repeats')).toHaveValue('calendar');
    expect(screen.getByLabelText('Every')).toHaveValue(6);
    expect(screen.getByLabelText('Unit')).toHaveValue('month');
    expect(screen.getByText(/Started from .Security review./)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^(Create|Save)/ }));

    expect(await screen.findByRole('heading', { name: 'Digital upkeep' })).toBeInTheDocument();
    expect(await screen.findByText('Security review')).toBeInTheDocument();
  });

  it('reuses the Digital category for a second preset', async () => {
    const { user } = renderApp('/activities/new?preset=backup');
    await screen.findByLabelText('Name');
    await user.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    await screen.findByText('Check backups');

    await user.click(screen.getByRole('link', { name: 'Security review' }));
    await screen.findByLabelText('Name');
    await user.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    expect(await screen.findByText('Security review', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Check backups')).toBeInTheDocument();
  });

  it('ignores an unknown preset', async () => {
    renderApp('/activities/new?preset=nope');
    expect(await screen.findByLabelText('Name')).toHaveValue('');
  });
});

describe('routines', () => {
  it('lists routine-type activities but not digital ones', async () => {
    const { user } = renderApp('/activities/new?preset=weekly-review');
    expect(await screen.findByLabelText('Name')).toHaveValue('Weekly review');
    await user.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    expect(await screen.findByRole('heading', { name: 'Routines' })).toBeInTheDocument();
    expect(await screen.findByText('Weekly review', { selector: 'p' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Digital' }));
    await user.click(await screen.findByRole('link', { name: 'Account review' }));
    await screen.findByLabelText('Name');
    await user.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    await screen.findByText('Review account:', { exact: false, selector: 'p' });

    await user.click(screen.getByRole('link', { name: 'Routines' }));
    expect(await screen.findByText('Weekly review', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText(/Review account/)).not.toBeInTheDocument();
  });

  it('does not show the digital warning on a routine preset', async () => {
    renderApp('/activities/new?preset=declutter');
    await screen.findByLabelText('Name');
    expect(screen.queryByText(/recovery codes/i)).not.toBeInTheDocument();
  });
});

describe('household', () => {
  it('starts a seasonal chore on the next occurrence of its date, with a window', async () => {
    renderApp('/activities/new?preset=spring-clean');
    // The pinned date is 5 Nov 2026, so the next 20 March is in 2027.
    expect(await screen.findByLabelText('Starting')).toHaveValue('2027-03-20');
    expect(screen.getByLabelText('Unit')).toHaveValue('year');
    expect(screen.getByLabelText('Grace days')).toHaveValue(14);
  });

  it('rolls an autumn date that has passed this year to next year', async () => {
    renderApp('/activities/new?preset=gutters');
    expect(await screen.findByLabelText('Starting')).toHaveValue('2027-10-01');
  });

  it('groups a saved household preset under a room heading', async () => {
    const { user } = renderApp('/activities/new?preset=bathroom');
    await screen.findByLabelText('Name');
    await user.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    expect(await screen.findByRole('heading', { name: 'Household' })).toBeInTheDocument();
    const group = await screen.findByRole('region', { name: 'No place set' });
    expect(group).toHaveTextContent('Clean the bathroom');
  });

  it('keeps digital items off the household page', async () => {
    const { user } = renderApp('/activities/new?preset=backup');
    await screen.findByLabelText('Name');
    await user.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    await screen.findByText('Check backups');
    await user.click(screen.getByRole('link', { name: 'Household' }));
    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument();
  });
});

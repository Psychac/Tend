import { screen, waitFor, within } from '@testing-library/react';
import { addAttachment, createActivity, createAsset } from '@tend/application';
import { createMemoryAttachmentStorage } from '@tend/infrastructure';
import { createNodeSqliteDatabase } from '@tend/infrastructure/testing';
import { MAX_ATTACHMENT_BYTES } from '@tend/domain';
import { createServices } from './providers/AppProvider';
import { renderApp } from './test-utils';

async function withAsset() {
  const db = createNodeSqliteDatabase();
  const files = createMemoryAttachmentStorage();
  const { deps } = createServices(db, undefined, undefined, undefined, files);
  const created = await createAsset(deps, { name: 'Water heater' });
  if (!created.ok) throw new Error('setup failed');
  const { user } = renderApp('/assets', { db, files });
  await user.click(await screen.findByRole('button', { name: 'Files for Water heater' }));
  const section = await screen.findByRole('region', { name: 'Files for Water heater' });
  return { user, files, section };
}

const pdf = (name: string, body = 'hello') => new File([body], name, { type: 'application/pdf' });

describe('attachments on an asset', () => {
  it('attaches a file, lists it, and removes it', async () => {
    const { user, files, section } = await withAsset();
    expect(within(section).getByText('No files attached.')).toBeInTheDocument();

    await user.upload(within(section).getByLabelText('Add a file'), pdf('invoice.pdf'));
    expect(await within(section).findByText('invoice.pdf')).toBeInTheDocument();
    expect(within(section).getByText('5 B')).toBeInTheDocument();
    expect(files.size()).toBe(1);

    await user.click(within(section).getByRole('button', { name: 'Remove invoice.pdf' }));
    await user.click(within(section).getByRole('button', { name: 'Confirm remove invoice.pdf' }));
    await waitFor(() => expect(within(section).queryByText('invoice.pdf')).not.toBeInTheDocument());
    expect(files.size()).toBe(0);
  });

  it('keeps the file when removal is not confirmed', async () => {
    const { user, files, section } = await withAsset();
    await user.upload(within(section).getByLabelText('Add a file'), pdf('invoice.pdf'));
    await within(section).findByText('invoice.pdf');
    await user.click(within(section).getByRole('button', { name: 'Remove invoice.pdf' }));
    await user.click(within(section).getByRole('button', { name: 'Keep' }));
    expect(within(section).getByText('invoice.pdf')).toBeInTheDocument();
    expect(files.size()).toBe(1);
  });

  it('refuses a file over the limit and says so', async () => {
    const { user, files, section } = await withAsset();
    const big = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'big.bin');
    await user.upload(within(section).getByLabelText('Add a file'), big);
    expect(await within(section).findByRole('alert')).toHaveTextContent(/too large/);
    expect(files.size()).toBe(0);
  });

  it('shows a file whose bytes are not on this device as missing', async () => {
    const { user, files, section } = await withAsset();
    await user.upload(within(section).getByLabelText('Add a file'), pdf('invoice.pdf'));
    await within(section).findByText('invoice.pdf');
    for (const f of await files.list()) await files.remove(f.id);

    // Closing and reopening the section re-reads it.
    await user.click(screen.getByRole('button', { name: 'Files for Water heater' }));
    await user.click(screen.getByRole('button', { name: 'Files for Water heater' }));
    const reopened = await screen.findByRole('region', { name: 'Files for Water heater' });
    expect(await within(reopened).findByText('File missing on this device')).toBeInTheDocument();
    expect(within(reopened).queryByRole('button', { name: /^Open/ })).not.toBeInTheDocument();
    expect(
      within(reopened).getByRole('button', { name: 'Remove invoice.pdf' }),
    ).toBeInTheDocument();
  });

  it('tells the person nothing was saved when the device is full', async () => {
    const db = createNodeSqliteDatabase();
    const memory = createMemoryAttachmentStorage();
    const full = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const files = { ...memory, put: () => Promise.reject(full) };
    const { deps } = createServices(db, undefined, undefined, undefined, files);
    await createAsset(deps, { name: 'Water heater' });
    const { user } = renderApp('/assets', { db, files });
    await user.click(await screen.findByRole('button', { name: 'Files for Water heater' }));
    const section = await screen.findByRole('region', { name: 'Files for Water heater' });

    await user.upload(within(section).getByLabelText('Add a file'), pdf('invoice.pdf'));
    // Both the section and the app-wide banner explain it.
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent).join(' ')).toMatch(/not saved|no room/i);
    expect(within(section).queryByText('invoice.pdf')).not.toBeInTheDocument();
    expect(memory.size()).toBe(0);
  });
});

describe('attachments on an activity, camera, and usage', () => {
  it('attaches a file to an activity', async () => {
    const db = createNodeSqliteDatabase();
    const files = createMemoryAttachmentStorage();
    const { deps } = createServices(db, undefined, undefined, undefined, files);
    await createActivity(deps, { name: 'Service the boiler', type: 'routine' });
    const { user } = renderApp('/activities', { db, files });
    await user.click(await screen.findByRole('button', { name: 'Files for Service the boiler' }));
    const section = await screen.findByRole('region', { name: 'Files for Service the boiler' });
    await user.upload(within(section).getByLabelText('Add a file'), pdf('manual.pdf'));
    expect(await within(section).findByText('manual.pdf')).toBeInTheDocument();
    expect(files.size()).toBe(1);
  });

  it('offers the camera and stores the photo like any file', async () => {
    const { user, files, section } = await withAsset();
    const camera = within(section).getByLabelText('Take a photo');
    expect(camera).toHaveAttribute('capture', 'environment');
    expect(camera).toHaveAttribute('accept', 'image/*');
    await user.upload(camera, new File(['img'], 'photo.jpg', { type: 'image/jpeg' }));
    expect(await within(section).findByText('photo.jpg')).toBeInTheDocument();
    expect(files.size()).toBe(1);
  });

  it('shows how many files are stored and their size in Settings', async () => {
    const db = createNodeSqliteDatabase();
    const files = createMemoryAttachmentStorage();
    const { deps } = createServices(db, undefined, undefined, undefined, files);
    const asset = await createAsset(deps, { name: 'Water heater' });
    if (!asset.ok) throw new Error('setup failed');
    await addAttachment(deps, {
      subject: { type: 'asset', id: asset.value.id },
      file: { name: 'a.pdf', type: 'application/pdf', data: new Blob(['hello']) },
    });
    renderApp('/settings', { db, files });
    expect(await screen.findByText(/1 attached file uses 5 B/)).toBeInTheDocument();
  });
});

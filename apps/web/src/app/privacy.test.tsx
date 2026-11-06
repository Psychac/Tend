import { screen } from '@testing-library/react';
import { renderApp } from './test-utils';

describe('privacy statement', () => {
  it('says plainly that data and backups are not encrypted', async () => {
    renderApp('/settings');
    const heading = await screen.findByRole('heading', { name: 'Privacy on this device' });
    const section = heading.closest('section')!;
    expect(section).toHaveTextContent(/not encrypted/i);
    expect(section).toHaveTextContent(/no passcode or lock/i);
    expect(section).toHaveTextContent(/recovery codes/i);
    expect(await screen.findByText(/Backup files are not encrypted: anyone/)).toBeInTheDocument();
  });

  it('never claims encryption or protection anywhere on the settings page', async () => {
    renderApp('/settings');
    await screen.findByRole('heading', { name: 'Privacy on this device' });
    await screen.findByText(/^Storage:/, { selector: 'p' });
    const text = document.body.textContent ?? '';
    // "encrypted" is only allowed as part of a denial; "protected" and "secure" not at all.
    expect(text).not.toMatch(/(?<!not |un)encrypted/i);
    expect(text).not.toMatch(/\bprotected\b|\bsecure(d|ly)?\b|\bsafe(ly)?\b/i);
  });
});

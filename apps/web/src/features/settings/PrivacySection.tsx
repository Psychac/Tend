/**
 * What is and is not protected on this device. Keep this accurate: the data is not
 * encrypted, and nothing here may suggest otherwise (G-19, spec 14).
 */
export function PrivacySection() {
  return (
    <section aria-labelledby="privacy-heading" className="space-y-2">
      <h3 id="privacy-heading" className="text-lg font-medium">
        Privacy on this device
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>
          Your data is kept in this browser and is not encrypted. Tend has no passcode or lock.
        </li>
        <li>
          Other websites cannot read it, but anyone who can use this device and browser profile can
          open Tend and see it.
        </li>
        <li>Backup files are not encrypted either. Keep them somewhere private.</li>
        <li>
          Don’t store passwords, authentication secrets or recovery codes in Tend, in notes or
          anywhere else.
        </li>
        <li>
          If the device is shared or might be lost, use the device’s own protection, such as a
          screen lock and disk encryption.
        </li>
      </ul>
    </section>
  );
}

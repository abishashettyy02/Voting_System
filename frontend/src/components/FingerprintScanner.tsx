import React from 'react';

type FingerprintSample = {
  provider: 'platform-webauthn';
  credentialId: string;
  verifiedAt: string;
};

type Props = {
  enabled: boolean;
  onScan: (sample: FingerprintSample) => void;
  storageKey?: string;
  reuseStoredCredential?: boolean;
};

const DEFAULT_STORAGE_KEY = 'voting_demo_webauthn_credential_id';

function randomBytes(len: number): Uint8Array {
  const bytes = new Uint8Array(len);
  window.crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = '';
  for (let i = 0; i < arr.length; i += 1) {
    str += String.fromCharCode(arr[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function registerCredential(): Promise<string> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: {
        name: 'Secure Voting Demo',
      },
      user: {
        id: randomBytes(32),
        name: 'voter@local.demo',
        displayName: 'Voting Demo User',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      attestation: 'none',
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Could not register system biometric credential');
  }

  const credentialId = toBase64Url(credential.rawId);
  return credentialId;
}

export default function FingerprintScanner({
  enabled,
  onScan,
  storageKey = DEFAULT_STORAGE_KEY,
  reuseStoredCredential = true,
}: Props) {
  const [status, setStatus] = React.useState<'locked' | 'ready' | 'registering' | 'scanning' | 'captured' | 'error'>(
    enabled ? 'ready' : 'locked'
  );
  const [errorText, setErrorText] = React.useState('');

  const supported =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    !!navigator.credentials;

  React.useEffect(() => {
    if (!enabled) {
      setStatus('locked');
    } else if (supported) {
      setStatus('ready');
    } else {
      setStatus('error');
      setErrorText('System biometric API is unavailable. Use HTTPS/localhost and a supported browser.');
    }
  }, [enabled, supported]);

  async function scanWithSystemFingerprint() {
    if (!enabled || !supported) return;
    setErrorText('');

    try {
      let credentialId = reuseStoredCredential ? localStorage.getItem(storageKey) : null;

      if (!credentialId) {
        setStatus('registering');
        credentialId = await registerCredential();
        if (reuseStoredCredential) {
          localStorage.setItem(storageKey, credentialId);
        }
      }

      setStatus('scanning');

      onScan({
        provider: 'platform-webauthn',
        credentialId,
        verifiedAt: new Date().toISOString(),
      });
      setStatus('captured');
    } catch (err: any) {
      setStatus('error');
      setErrorText(err?.message || 'Fingerprint scan cancelled or failed');
    }
  }

  function resetCredential() {
    localStorage.removeItem(storageKey);
    setStatus(enabled ? 'ready' : 'locked');
    setErrorText('');
  }

  return (
    <div className={`glass rounded-2xl p-4 border ${enabled ? 'border-indigo-500/30' : 'border-white/20'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">System Fingerprint Scanner</div>
          <div className="text-xs opacity-70 mt-1">Uses your device biometric prompt (Touch ID / Windows Hello)</div>
        </div>
        <div className="badge">{status}</div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/20 bg-white/10 p-4 text-sm leading-relaxed">
        Tap scan to capture your system fingerprint credential. Database verification happens in the next step.
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!enabled || !supported || status === 'registering' || status === 'scanning'} onClick={scanWithSystemFingerprint}>
          {status === 'registering' ? 'Registering...' : status === 'scanning' ? 'Capturing...' : 'Capture Fingerprint Credential'}
        </button>
        <button className="btn-ghost" disabled={!enabled} onClick={resetCredential}>
          Reset Device Credential
        </button>
      </div>

      {errorText ? <div className="mt-3 text-sm text-rose-500">{errorText}</div> : null}

      <div className="mt-3 text-xs opacity-70">
        Browser security does not expose raw fingerprint data. This step captures credential metadata; matching is done later against admin-uploaded records.
      </div>
    </div>
  );
}

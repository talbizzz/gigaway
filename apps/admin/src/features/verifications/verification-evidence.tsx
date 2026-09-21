import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

const BUCKET = 'verification-docs'

/**
 * 20260918180000 backfilled cv_path with this marker for applications from
 * the brief email-only window — their photo and CV were emailed to
 * verify@gigaway.app as attachments and never stored, so there is nothing at
 * this path to sign.
 */
const LEGACY_PREFIX = 'legacy/'

type Signed = { url: string | null; error: string | null }

async function sign(path: string | null): Promise<Signed | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
  // createSignedUrl reports failure in `error` instead of throwing. Ignoring
  // it is what once made a missing file look like an empty section.
  if (error || !data) return { url: null, error: error?.message ?? 'no URL returned' }
  return { url: data.signedUrl, error: null }
}

const muted = { color: 'var(--text-muted)', margin: 0 } as const

/**
 * The selfie and CV in the verification-docs bucket, via signed URLs. Only
 * resolves for an admin session — the bucket's one select policy
 * (verification_docs_read_admin) is scoped to is_admin(). A 5-minute expiry
 * is enough to review one application without leaving a long-lived link to
 * someone's ID photo sitting in a browser tab.
 *
 * Says what it can't show, and why, rather than rendering nothing: an empty
 * gap is indistinguishable from a bug.
 */
export function VerificationEvidence({
  selfiePath,
  cvPath,
}: {
  selfiePath: string | null
  cvPath: string | null
}) {
  const legacyCv = !!cvPath && cvPath.startsWith(LEGACY_PREFIX)
  const realCvPath = cvPath && !legacyCv ? cvPath : null

  const { data, isLoading } = useQuery({
    queryKey: ['verification-evidence', selfiePath, realCvPath],
    queryFn: async () => {
      // Signed independently, so one failure can't hide the other file.
      const [selfie, cv] = await Promise.all([sign(selfiePath), sign(realCvPath)])
      return { selfie, cv }
    },
    enabled: !!selfiePath || !!realCvPath,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      {selfiePath ? (
        data?.selfie?.url ? (
          <>
            <p style={muted}>Check the photo against the prompt above before deciding.</p>
            <a href={data.selfie.url} target="_blank" rel="noreferrer">
              <img
                src={data.selfie.url}
                alt="Verification selfie"
                style={{
                  maxWidth: 320,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-strong)',
                }}
              />
            </a>
          </>
        ) : data?.selfie?.error ? (
          <p className="field-error">Couldn't load the selfie: {data.selfie.error}</p>
        ) : isLoading ? (
          <p style={muted}>Loading the selfie…</p>
        ) : null
      ) : (
        <p style={muted}>No selfie is stored for this application.</p>
      )}

      {realCvPath ? (
        data?.cv?.url ? (
          <div>
            <a href={data.cv.url} target="_blank" rel="noreferrer" className="btn btn-secondary">
              Open CV
            </a>
          </div>
        ) : data?.cv?.error ? (
          <p className="field-error">Couldn't load the CV: {data.cv.error}</p>
        ) : isLoading ? (
          <p style={muted}>Loading the CV…</p>
        ) : null
      ) : legacyCv ? null : (
        <p style={muted}>No CV uploaded — this applicant gave links only.</p>
      )}

      {(!selfiePath || legacyCv) && (
        <p style={muted}>
          This application was submitted before evidence was stored in the app. Its photo and CV
          were sent to <strong>verify@gigaway.app</strong> as email attachments and never saved
          here — the originals are in that inbox, subject-lined with the applicant's profile id.
        </p>
      )}
    </div>
  )
}

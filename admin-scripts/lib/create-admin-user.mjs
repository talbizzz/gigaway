export class EmailTakenError extends Error {
  constructor(email) {
    super(`An account with ${email} already exists.`)
    this.name = 'EmailTakenError'
  }
}

async function must(label, query) {
  const { error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
}

/**
 * Best-effort undo for an auth user that was created moments ago and never
 * used for anything. Safe only because of that — this deletes rows by id.
 * Returns the steps that failed, so the caller can tell the operator exactly
 * what to clean up by hand rather than claiming a clean slate.
 */
async function rollback(supabase, id) {
  const problems = []
  const attempt = async (label, query) => {
    try {
      await must(label, query)
    } catch (err) {
      problems.push(err.message)
    }
  }
  await attempt('admin_users', supabase.from('admin_users').delete().eq('id', id))
  await attempt('contact_details', supabase.from('contact_details').delete().eq('profile_id', id))
  await attempt('profiles', supabase.from('profiles').delete().eq('id', id))
  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) problems.push(`auth user: ${error.message}`)
  return problems
}

/**
 * Creates a brand-new admin: an auth user that is in admin_users and is NOT
 * also an artist.
 *
 * The last part is the point. Creating any auth user fires handle_new_user(),
 * which creates a profiles + contact_details row — for an admin that would
 * quietly make them a member as well. Those two rows are deleted straight
 * away. That is only safe because the user was created a moment ago in this
 * very call; this function therefore never touches an account that already
 * exists (an existing account may belong to a real artist, and deleting its
 * profile cascades into their trips, offers and reviews). If the email is
 * taken it stops and says so.
 *
 * Not atomic across the Auth API and the database, so any failure after the
 * user is created triggers a rollback of everything done so far.
 */
export async function createAdminUser(supabase, { email, password, displayName }) {
  const { data, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError) {
    if (createError.code === 'email_exists' || /already (been )?registered/i.test(createError.message)) {
      throw new EmailTakenError(email)
    }
    throw new Error(`Could not create the auth user: ${createError.message}`)
  }

  const id = data.user.id

  try {
    await must('removing the member contact row the signup trigger created',
      supabase.from('contact_details').delete().eq('profile_id', id))
    await must('removing the member profile the signup trigger created',
      supabase.from('profiles').delete().eq('id', id))
    await must('registering the admin',
      supabase.from('admin_users').insert({ id, display_name: displayName }))

    // Trust the database, not the absence of an error.
    const admin = await supabase.from('admin_users').select('id').eq('id', id)
    const profile = await supabase.from('profiles').select('id').eq('id', id)
    if (admin.error || profile.error) throw new Error('could not read back the result')
    if (admin.data.length !== 1) throw new Error('admin_users row is missing after insert')
    if (profile.data.length !== 0) throw new Error('a member profile still exists for this admin')
  } catch (err) {
    const problems = await rollback(supabase, id)
    const undone = problems.length === 0
      ? 'Everything was rolled back — nothing was left behind.'
      : `Rollback was incomplete, clean up user ${id} by hand: ${problems.join('; ')}`
    throw new Error(`${err.message}. ${undone}`)
  }

  return { id }
}

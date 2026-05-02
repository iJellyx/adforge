import { auth, currentUser } from '@clerk/nextjs/server'

/**
 * Server-side helpers for reading the signed-in user.
 * Mirrors the AdSplit pattern (`getUserId` returns the Clerk user id or null)
 * so any route ported between the two products looks the same.
 */

/** The Clerk user id (e.g. "user_2abc...") for the current request, or null. */
export async function getUserId(): Promise<string | null> {
  const { userId } = await auth()
  return userId
}

/** Full Clerk user object — call this when you need email, name, image. */
export async function getUser() {
  return currentUser()
}

/** Throws a 401 if the user isn't signed in; otherwise returns their id. */
export async function requireUserId(): Promise<string> {
  const userId = await getUserId()
  if (!userId) {
    throw new Response('Unauthorized', { status: 401 })
  }
  return userId
}

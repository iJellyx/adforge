import { redirect } from 'next/navigation'

/** Root → bounce to dashboard. The Clerk middleware redirects unauthenticated
 *  users to /sign-in, and signed-in users skip straight through. */
export default function Home() {
  redirect('/dashboard')
}

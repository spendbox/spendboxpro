# Testing before the live site

Two levels: a preview of every change (already there), and a full test version with its own
database (a one-off set-up, about 20 minutes).

## 1. Preview every change before merging (already working)

Vercel builds every pull request on its own private address before it goes live.
- On the pull request page on GitHub, open the **Vercel** comment or the **Deployments** box, and tap
  **Visit Preview**.
- The preview shows a red **"Preview: not the live game"** badge at the bottom of the screen.
- Try the change there. When it's right, merge the pull request, and only then does it go live.

**Careful:** until step 2 is done, previews use the **live database**. Money, challenges and
messages in a preview are real. Use a test account.

## 2. A full test version with its own database (recommended)

Everything is separate: test money, test players, nothing touches the real game.

1. **A new Supabase project.** In Supabase, create a second project, called e.g.
   `newtown-test`, in the same region as the live one.
2. **Its database.** In the new project's **SQL Editor**, paste and run these four files, one
   after another, in order (each takes a moment):
   - `game-db/setup/part-1-of-4.sql`
   - `game-db/setup/part-2-of-4.sql`
   - `game-db/setup/part-3-of-4.sql`
   - `game-db/setup/part-4-of-4.sql`

   They're every `game-db` file put together. When new `game-db` files are added, run the new
   ones there too, like on the live database: test there first.
3. **Sign-in.** In the new project's **Authentication → URL Configuration**, add the test
   address (step 5) and `https://*.vercel.app/**` to the redirect URLs.
4. **Point previews at it.** In Vercel go to the project, then **Settings → Environment
   Variables**. For each of these, add a value for the **Preview** environment only (leave
   Production as it is), copied from the new project's **Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` if that's what
     the live one uses)
   - `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)
   - `PAYSTACK_SECRET_KEY`: your Paystack **test** key (`sk_test_...`), so no real money moves
   - `NEXT_PUBLIC_APP_ENV` = `test` (the badge then says **"Test version"**)
5. **A fixed test address** (optional, handy). In Vercel, open **Settings → Domains** and add
   `test.newtown.world`, linked to a Git branch called `staging`. Every update merged into
   `staging` then shows up at test.newtown.world before it's merged into `main` for everyone.

After that, every preview and the test address use the test database. Break things freely.

## What to check on a test run

- **Sign in, start a life**, find a home.
- **Fight:** play with two phones (or a phone and a computer, two accounts). Open a challenge on
  one and join it from the other, within a minute. Watch it start, play it, and check the winner
  is paid. Also try one where nobody joins: the stake comes back.
- **Voice:** in the challenge, tap Join voice on both and check you hear each other.
- **Going into places**, the people list, the phone and notifications.

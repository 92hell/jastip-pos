# Deploying Titip Laili Yuk

Two copies of the same app, both free:

| | Who uses it | Database | Sign-in |
|---|---|---|---|
| **titip-laili-demo** | anyone (the portfolio demo) | Neon `jastip_demo`, reset on every start | "Try as the admin" button |
| **titip-laili** | Laili and her clients (invoice links) | Neon `jastip_laili`, her real data | `laili` + the password you set |

Both run on Render's free plan: they sleep after about 15 minutes without visitors and take about a
minute to wake up. The installed app still opens saved shopping lists while the server sleeps. Moving
Laili's copy to a paid plan later (about US$7/month) only means changing its plan in Render.

## 1. Databases (Neon, free, does not expire)

1. Sign up at [neon.tech](https://neon.tech) and create a project. Region: **AWS Asia Pacific
   (Singapore)**, close to the Render servers.
2. In the project, open **Databases** and create two: `jastip_demo` and `jastip_laili`.
3. For each, open **Connect**, choose the database, and copy the connection string. It looks like
   `postgresql://user:password@ep-…-pooler.ap-southeast-1.aws.neon.tech/jastip_demo?sslmode=require`.
   Keep both strings private; they are passwords.

The app creates its tables itself on first start (migrations), so the databases stay empty until then.

## 2. App (Render, free)

1. Sign in to [render.com](https://render.com) with GitHub, then **New → Blueprint** and pick the
   `92hell/jastip-pos` repository. Render reads [`render.yaml`](../render.yaml) and shows both services.
2. It asks for the values that are not in the code:
   - `titip-laili-demo` → `DATABASE_URL`: the `jastip_demo` string
   - `titip-laili` → `DATABASE_URL`: the `jastip_laili` string
   - `titip-laili` → `OWNER_PASSWORD`: Laili's first password (12+ characters). Write it down for
     her. It is only used to create her account on the first start: she then changes it in the app
     (**Lainnya → Ganti kata sandi** on the phone, or her name at the top on a computer), and
     changing `OWNER_PASSWORD` in Render afterwards has no effect.
3. **Apply**. The first build takes a few minutes. Then:
   - the demo is at `https://titip-laili-demo.onrender.com`
   - Laili's shop at `https://titip-laili.onrender.com` (sign in as `laili`)

   If Render gives a different address (the name was taken), update `APP_URL` in `wake/wake.js`.
4. In Laili's copy, open **Pengaturan toko** and enter her real payment accounts and WhatsApp. They
   only exist in her database, never in the code.

Every push to `main` redeploys both. Pushes that only change docs, tests or the wake-up page do not.

## 3. Demo link (GitHub Pages)

The demo sleeps, so the link to share is a small page that wakes it and opens it when it answers:
**https://92hell.github.io/jastip-pos/**.

Once: GitHub → repository **Settings → Pages → Source: GitHub Actions**. The `Wake-up page`
workflow then publishes `wake/` on every change to it (or run it from the Actions tab).

## 4. Install on Laili's phone (Android)

Open `https://titip-laili.onrender.com` in Chrome, sign in, then **Lainnya → Pasang aplikasi** (or
Chrome's menu ⋮ → **Install app**). On an iPhone: Share → **Add to Home Screen**.

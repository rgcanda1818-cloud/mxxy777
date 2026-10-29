# Free GitHub Pages sign-in setup

GitHub Pages only hosts static files; it cannot run `server.py`, the local SQLite database, or Northgate's six-digit email OTP flow. Customer sign-up on GitHub Pages uses Firebase Authentication's email verification link instead. Firebase Authentication is available on the no-cost Spark plan, subject to Firebase's current limits. Seller registration, admin access, and Northgate data such as orders still require the Python API.

## Configure Firebase Authentication

1. Create a Firebase project and keep it on the no-cost Spark plan. Do not enable billing or upgrade the project. Check Firebase's current limits before relying on the service; free-tier quotas and availability can change.
2. In Firebase Console, open **Authentication → Sign-in method** and enable **Email/Password**.
3. In **Project settings → General**, register a Web app if one is not already registered. Copy its web app config values into `firebase-config.js`, replacing all `YOUR_...` placeholders. The Firebase web config is public client configuration, not a password or service-account secret; never put a service-account key or other private credential in this file.
4. In **Authentication → Settings → Authorized domains**, add the GitHub Pages hostname, such as `yourname.github.io`. If you use a custom domain, add that hostname too.
5. In **Authentication → Templates**, review the email verification message and keep the action link enabled. Push the site to GitHub and enable GitHub Pages for the repository in **Settings → Pages**. The account flow sends a Firebase verification link that returns the user to the current page when its hostname is authorized. If Firebase rejects the return URL, Northgate retries without a custom return URL; after verifying, return to the site and sign in.

`firebase-config.js` must contain the Firebase Web app config for the same project. These values identify the project and are public client configuration; never put service-account keys or other private credentials in the file. Existing accounts in the local SQLite database are not copied to Firebase; create new hosted accounts.

## What remains local-only

Firebase Authentication stores and checks customer credentials and sends verification links. It does not host the Northgate Python API or the role records used by the separate admin and seller sign-in pages. Profile edits, saved addresses, order history, checkout order creation, product management, and admin order management still call `/api/...` endpoints and will not work from GitHub Pages until a separate backend is deployed and connected. The cart itself is stored in the browser. Firebase Auth users created on GitHub Pages are not automatically added to the server's SQLite database.

The existing `render.yaml` provisions paid Render resources. Do not use that Blueprint if you need to avoid charges. No Firebase database or paid service is required for the authentication-only setup described above.

## Separate admin and seller access

Run the Northgate Python server and use its SQLite or PostgreSQL database for role-checked dashboards. The storefront keeps its regular customer sign-in. Administrators use `admin-login.html` and the protected `admin.html` dashboard; sellers use `seller-login.html` and the protected `seller.html` dashboard. Each role has separate product-management API routes, and the server checks the account role for dashboard pages and every management request.

Sellers can create an account from `seller-login.html` using the **Create a seller account** link. After verifying the email code, new seller accounts are signed in automatically. To grant seller access to an existing customer account, run this from the project directory:

```powershell
python server.py --promote-admin admin@example.com
```

Only administrator accounts can use the admin dashboard and administer all products and orders. Seller accounts can use only the seller dashboard, create and manage only their own products, and view orders containing those products. Seller order responses include only the seller's purchased items and the value of those items, not other sellers' line items. Seller access is assigned automatically only through the dedicated seller registration page; customer signup does not grant seller access.

## Account and admin security

The users table assigns `customer` as the default role. Public customer registration ignores any submitted role or seller-access fields; admin access is granted only by the server-side `--promote-admin` command. Passwords are stored as salted PBKDF2-SHA256 hashes, never as plain text. Login creates a random, HttpOnly session cookie; the database stores its token hash and user ID. On each request, Northgate loads the current role from the users table and checks it on protected dashboard pages and admin APIs, so role changes take effect without trusting browser state or a stale role in the session.

All Python-server sign-in endpoints share an account-wide limit: five consecutive incorrect passwords lock that email address out for 30 minutes. The lock is stored in the database, shared across customer, admin, and seller sign-in, and cleared after a successful password check or when the lock expires. When the customer sign-in falls back to Firebase on a static deployment, the page also applies a five-attempt, 30-minute browser-side limit. That browser-side limit can be cleared by the user and is not a security boundary; Firebase's own authentication protections remain authoritative for Firebase-hosted sign-in.

## Local server email verification codes (Gmail SMTP)

When using the Python server, customer and seller registrations use a six-digit email code that expires after 10 minutes; verification attempts and resend requests are rate limited. This is separate from the Firebase email verification link used for customer signup on GitHub Pages. Previously existing server accounts remain verified during database migration.

To enable code delivery with Gmail:

1. Enable 2-Step Verification on the Gmail account that will send Northgate mail.
2. Create a Google **App Password** for Northgate. Use this app password, not the normal Gmail password. Google only shows it when it is created.
3. Open PowerShell in the project folder, set the credentials for that PowerShell window, then start the app in the same window:

   ```powershell
   $env:NORTHGATE_SMTP_USERNAME = "your-sender@gmail.com"
   $env:NORTHGATE_SMTP_PASSWORD = "your-16-character-app-password"
   python server.py
   ```

4. Open `http://127.0.0.1:8080` and create an account. Do not add these values to `server.py`, `firebase-config.js`, or any file committed to the project. Restarting from another terminal requires setting the environment variables again.

The Gmail account is used only to send verification emails. Static GitHub Pages cannot send these codes by itself; email OTP signup requires the Python server and its SMTP configuration.

Uploaded product photos are stored as files in the website's `product-images` directory; the database stores their paths and product metadata. A hosted deployment must persist both its database and uploaded image files (for example, with persistent storage or an object-storage service). A disposable application filesystem is not suitable for keeping uploaded photos.

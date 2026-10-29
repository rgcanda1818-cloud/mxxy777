# Northgate Store

Northgate is a small online storefront with customer accounts, a shopping cart, product reviews, order tracking, and separate seller and administrator dashboards. The frontend is built with HTML, CSS, and vanilla JavaScript. A Python standard-library HTTP server serves the site and its JSON API; data is stored in SQLite by default, with optional PostgreSQL support.

## Features

- Browse and search products, view product details, manage a browser-stored cart, and place orders.
- Register and manage a customer profile, saved addresses, and order history.
- Leave public product reviews after an eligible delivered purchase.
- Register as a seller, manage seller-owned products and inventory, and see orders containing those products.
- Manage all products, stock, users, and orders from the admin dashboard.
- Upload product images; the server validates uploads and stores image files in `product-images/`.
- Use server-side email verification and role-based sign-in when running the Python app. Customer sign-in on a static GitHub Pages deployment can instead use Firebase Authentication.

## Project layout

| File or directory | Purpose |
| --- | --- |
| `index.html`, `product.html`, `cart.html`, `account.html` | Customer storefront, product, cart, and account pages |
| `admin-login.html`, `admin.html` | Administrator sign-in and dashboard |
| `seller-login.html`, `seller-register.html`, `seller.html` | Seller sign-in, registration, and dashboard |
| `style.css`, `script.js` | Shared styles and frontend behavior |
| `server.py` | Static-file server, JSON API, database setup, and role-protected operations |
| `firebase-config.js`, `firebase-auth.js` | Optional Firebase customer authentication for static hosting |
| `product-images/` | Product image uploads and bundled product images |
| `tests/` | Database and API tests |
| `DEPLOYING.md` | Firebase/GitHub Pages setup and account/security deployment details |
| `render.yaml` | Render Blueprint for a Python web service and PostgreSQL database |

## Run locally

Python 3 is required. From the project directory, install the dependencies and start the server:

```powershell
python -m pip install -r requirements.txt
python server.py
```

Then open [http://127.0.0.1:8080](http://127.0.0.1:8080). On Windows, `Run Northgate.bat` starts the server if needed and opens the storefront in your browser.

By default, the server listens only on `127.0.0.1` and uses the SQLite database at `~/.northgate/northgate.sqlite3` (on Windows, under your user profile). The database is created and initialized when the server starts. To select a different SQLite data directory, set `NORTHGATE_DATA_DIR` to a directory outside the website folder before starting the server.

The local server health endpoint is `GET /api/health`. To stop a server started in a terminal, press `Ctrl+C`.

## Email verification

Server-backed customer and seller registration requires email verification. Configure Gmail SMTP credentials as environment variables in the same terminal used to start the server:

```powershell
$env:NORTHGATE_SMTP_USERNAME = "your-sender@gmail.com"
$env:NORTHGATE_SMTP_PASSWORD = "your-gmail-app-password"
python server.py
```

Create a Gmail App Password after enabling 2-Step Verification. Do not put SMTP credentials in project files or commit them. `NORTHGATE_SMTP_FROM` can optionally set a separate sender address; by default the username is used. See [DEPLOYING.md](DEPLOYING.md) for additional setup and troubleshooting context.

## Accounts and roles

- Customer accounts receive the `customer` role by default.
- Sellers create accounts through the seller registration flow. Seller accounts can manage their own products and see only their own order line items.
- Admin access must be granted by an existing operator from the project directory:

  ```powershell
  python server.py --promote-admin admin@example.com
  ```

  The account must already exist. `Promote Northgate Admin.bat` provides an interactive Windows shortcut.

Admin and seller dashboards use separate sign-in pages and protected server endpoints. The server checks the current database role on protected requests; changing browser state does not grant access.

## Configuration

| Environment variable | Default | Description |
| --- | --- | --- |
| `NORTHGATE_HOST` | `127.0.0.1` | Address to bind the HTTP server. Use `0.0.0.0` only when intentionally exposing it on a network. |
| `NORTHGATE_PORT` | `PORT`, or `8080` | Port for the HTTP server. `PORT` is used as a fallback for hosting platforms. |
| `NORTHGATE_DATA_DIR` | `~/.northgate` | Directory for the SQLite database; must be outside the website directory. Ignored when `DATABASE_URL` is set. |
| `DATABASE_URL` | unset | PostgreSQL connection URL. PostgreSQL support is provided by the `psycopg[binary]` dependency in `requirements.txt`. |
| `NORTHGATE_MAX_CONCURRENT_REQUESTS` | `64` | Maximum concurrent request handlers (minimum 8). |
| `NORTHGATE_SMTP_USERNAME` | unset | Gmail address used for server-side verification email. |
| `NORTHGATE_SMTP_PASSWORD` | unset | Gmail App Password used for server-side verification email. |
| `NORTHGATE_SMTP_FROM` | SMTP username | Optional sender address for verification email. |

Keep the database and uploaded images on persistent storage in hosted environments. SQLite data is outside the site directory by default, while uploaded images are written to `product-images/`; preserve both when deploying or migrating. Do not expose the development HTTP server directly to the public internet without HTTPS and appropriate production hosting controls.

## Static hosting

GitHub Pages can serve the frontend but cannot run `server.py`, its database, or server-side verification email. Firebase can provide customer email/password authentication and verification links for the static-hosted signup flow, but this does not provide API access for checkout, profile/address management, reviews, orders, or product dashboards.

Follow [DEPLOYING.md](DEPLOYING.md) for Firebase configuration and the exact static-hosting limitations. Firebase web configuration is public client configuration; never put service-account keys or other private credentials in `firebase-config.js`.

## Render deployment

`render.yaml` describes a Render Python web service connected to a managed PostgreSQL database. The Blueprint provisions paid resources; review current pricing before deploying. Configure SMTP credentials through the hosting provider's secret environment-variable settings if server-side verification email is needed. Ensure uploaded `product-images/` files are stored persistently, since application filesystems may be ephemeral.

## Tests

Run the unit and API tests from the project directory:

```powershell
python -m unittest discover -s tests -v
```

The suite covers SQLite/PostgreSQL query translation and API behavior including role separation, account lockout, email verification, inventory, order visibility, product reviews, and image uploads.

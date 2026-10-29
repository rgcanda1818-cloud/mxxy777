import base64
import hashlib
import json
import tempfile
import threading
import time
import unittest
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener
from unittest.mock import patch

import server


class ProductManagementApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        temporary_root = Path(self.temporary_directory.name)
        self.patches = [
            patch.object(server, "DATABASE_URL", ""),
            patch.object(server, "DATABASE_DIR", temporary_root / "data"),
            patch.object(server, "DATABASE", temporary_root / "data" / "northgate.sqlite3"),
            patch.object(server, "LEGACY_DATABASE", temporary_root / "legacy.sqlite3"),
            patch.object(server, "ROOT", temporary_root / "site"),
        ]
        for item in self.patches:
            item.start()
        Path(server.ROOT).mkdir()
        for page in ("admin.html", "seller.html", "admin-login.html", "seller-login.html", "seller-register.html"):
            (Path(server.ROOT) / page).write_text("<!doctype html><title>Northgate</title>", encoding="utf-8")
        server.initialize_database()
        self.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.NorthgateHandler)
        self.origin = f"http://127.0.0.1:{self.httpd.server_port}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.admin = self._register("admin@example.test")
        self.seller = self._register("seller@example.test")
        with server.connect_db() as connection:
            connection.execute("UPDATE users SET role='admin' WHERE email=?", ("admin@example.test",))
            connection.execute("UPDATE users SET seller_enabled=1 WHERE email=?", ("seller@example.test",))

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)
        for item in reversed(self.patches):
            item.stop()
        self.temporary_directory.cleanup()

    def _register(self, email):
        opener = build_opener(HTTPCookieProcessor(CookieJar()))
        with patch.object(server, "send_verification_email") as send_email:
            response = self._request(
                opener,
                "/api/register",
                "POST",
                {"email": email, "name": email.split("@")[0], "password": "valid-password"},
                202,
            )
        self.assertTrue(response["verificationRequired"])
        self._request(
            opener,
            "/api/verify-email",
            "POST",
            {"email": email, "code": send_email.call_args.args[1]},
        )
        return opener

    def _request(self, opener, path, method="GET", body=None, expected_status=200):
        headers = {"Accept": "application/json", "Origin": self.origin}
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        request = Request(f"{self.origin}{path}", data=data, headers=headers, method=method)
        try:
            with opener.open(request) as response:
                status = response.status
                payload = json.loads(response.read())
        except HTTPError as error:
            status = error.code
            payload = json.loads(error.read())
            error.close()
        self.assertEqual(status, expected_status, payload)
        return payload

    @staticmethod
    def _product_payload(status="active"):
        return {
            "name": "Linen Camp Shirt",
            "category": "Fashion",
            "price": 49.99,
            "description": "Lightweight linen shirt.",
            "status": status,
            "lowStockThreshold": 3,
            "images": ["photo-1490481651871-ab68de25d43d"],
            "variants": [{"size": "M", "color": "Natural", "sku": "LINEN-M-NAT", "stock": 2}],
        }

    def test_create_edit_archive_and_restore_product(self):
        created = self._request(self.admin, "/api/admin/products", "POST", self._product_payload(), 201)["product"]
        product_path = f"/api/admin/products/{created['id']}"
        self.assertEqual(created["variants"][0]["stock"], 2)

        updated_payload = self._product_payload("draft")
        updated_payload["price"] = 44.5
        updated_payload["variants"][0]["stock"] = 1
        updated = self._request(self.admin, product_path, "PUT", updated_payload)["product"]
        self.assertEqual(updated["price"], 44.5)
        self.assertEqual(updated["variants"][0]["stock"], 1)
        self.assertTrue(any("Price changed from $49.99 to $44.50." in event["details"] for event in updated["activity"]))

        archived = self._request(
            self.admin,
            f"{product_path}/status",
            "PUT",
            {"status": "archived"},
        )["product"]
        self.assertEqual(archived["status"], "archived")
        self.assertEqual(archived["archivedFromStatus"], "draft")
        restored = self._request(
            self.admin,
            f"{product_path}/status",
            "PUT",
            {"status": "restore"},
        )["product"]
        self.assertEqual(restored["status"], "draft")
        self.assertNotIn(created["id"], [item["id"] for item in self._request(self.admin, "/api/products")["products"]])

    def test_seller_cannot_manage_another_sellers_product(self):
        product = self._request(
            self.seller,
            "/api/seller/products",
            "POST",
            self._product_payload(),
            201,
        )["product"]
        path = f"/api/admin/products/{product['id']}"
        self._request(self.admin, path, "PUT", self._product_payload(), 200)

        other_product = self._request(
            self.admin,
            "/api/admin/products",
            "POST",
            {**self._product_payload(), "variants": [{"size": "S", "color": "Blue", "sku": "LINEN-S-BLU", "stock": 5}]},
            201,
        )["product"]
        self._request(
            self.seller,
            f"/api/seller/products/{other_product['id']}/status",
            "PUT",
            {"status": "archived"},
            404,
        )
        visible_ids = [item["id"] for item in self._request(self.seller, "/api/seller/products")["products"]]
        self.assertEqual(visible_ids, [product["id"]])

    def test_admin_and_seller_login_and_dashboard_access_are_separate(self):
        admin_login = build_opener(HTTPCookieProcessor(CookieJar()))
        admin_account = self._request(
            admin_login,
            "/api/admin/login",
            "POST",
            {"email": "admin@example.test", "password": "valid-password"},
        )["account"]
        self.assertTrue(admin_account["isAdmin"])
        self.assertFalse(admin_account["isSeller"])

        seller_login = build_opener(HTTPCookieProcessor(CookieJar()))
        seller_account = self._request(
            seller_login,
            "/api/seller/login",
            "POST",
            {"email": "seller@example.test", "password": "valid-password"},
        )["account"]
        self.assertTrue(seller_account["isSeller"])
        self.assertFalse(seller_account["isAdmin"])

        self._request(
            self.seller,
            "/api/admin/login",
            "POST",
            {"email": "seller@example.test", "password": "valid-password"},
            403,
        )
        self._request(
            self.admin,
            "/api/seller/login",
            "POST",
            {"email": "admin@example.test", "password": "valid-password"},
            403,
        )
        self._request(self.seller, "/api/admin/products", expected_status=403)
        self._request(self.admin, "/api/seller/products", expected_status=403)

    def test_failed_logins_lock_account_across_roles_for_thirty_minutes(self):
        account = build_opener(HTTPCookieProcessor(CookieJar()))
        for attempt in range(server.LOGIN_MAX_ATTEMPTS - 1):
            self._request(
                account,
                "/api/login",
                "POST",
                {"email": "admin@example.test", "password": "incorrect-password"},
                401,
            )

        locked = self._request(
            account,
            "/api/admin/login",
            "POST",
            {"email": "admin@example.test", "password": "incorrect-password"},
            429,
        )
        self.assertIn("30 minutes", locked["error"])

        blocked = self._request(
            account,
            "/api/seller/login",
            "POST",
            {"email": "admin@example.test", "password": "valid-password"},
            429,
        )
        self.assertIn("Too many failed sign-in attempts", blocked["error"])

        with server.connect_db() as connection:
            connection.execute(
                "UPDATE login_attempts SET locked_until = ? WHERE email_hash = ?",
                (
                    int(time.time()) - 1,
                    hashlib.sha256(b"admin@example.test").hexdigest(),
                ),
            )
        signed_in = self._request(
            account,
            "/api/login",
            "POST",
            {"email": "admin@example.test", "password": "valid-password"},
        )
        self.assertEqual(signed_in["account"]["email"], "admin@example.test")
        with server.connect_db() as connection:
            remaining = connection.execute(
                "SELECT 1 FROM login_attempts WHERE email_hash = ?",
                (hashlib.sha256(b"admin@example.test").hexdigest(),),
            ).fetchone()
        self.assertIsNone(remaining)

    def test_successful_login_clears_failed_attempt_count(self):
        account = build_opener(HTTPCookieProcessor(CookieJar()))
        for _ in range(2):
            self._request(
                account,
                "/api/login",
                "POST",
                {"email": "admin@example.test", "password": "incorrect-password"},
                401,
            )
        self._request(
            account,
            "/api/login",
            "POST",
            {"email": "admin@example.test", "password": "valid-password"},
        )
        with server.connect_db() as connection:
            remaining = connection.execute(
                "SELECT 1 FROM login_attempts WHERE email_hash = ?",
                (hashlib.sha256(b"admin@example.test").hexdigest(),),
            ).fetchone()
        self.assertIsNone(remaining)

    def test_admin_can_view_registered_user_names_and_emails(self):
        response = self._request(self.admin, "/api/admin/users")
        users_by_email = {user["email"]: user for user in response["users"]}

        self.assertIn("admin@example.test", users_by_email)
        self.assertIn("seller@example.test", users_by_email)
        self.assertEqual(users_by_email["admin@example.test"]["username"], "admin")
        self.assertEqual(users_by_email["admin@example.test"]["role"], "admin")
        self.assertTrue(users_by_email["admin@example.test"]["emailVerified"])
        self.assertEqual(users_by_email["seller@example.test"]["role"], "seller")
        self.assertNotIn("password", users_by_email["admin@example.test"])
        self._request(self.seller, "/api/admin/users", expected_status=403)

        with self.seller.open(f"{self.origin}/seller.html") as response:
            self.assertEqual(response.status, 200)
            self.assertTrue(response.geturl().endswith("/seller.html"))
        with self.seller.open(f"{self.origin}/admin.html") as response:
            self.assertEqual(response.status, 200)
            self.assertTrue(response.geturl().endswith("/seller.html"))
        with self.admin.open(f"{self.origin}/admin.html") as response:
            self.assertEqual(response.status, 200)
            self.assertTrue(response.geturl().endswith("/admin.html"))
        with self.admin.open(f"{self.origin}/seller.html") as response:
            self.assertEqual(response.status, 200)
            self.assertTrue(response.geturl().endswith("/admin.html"))

        customer = self._register("customer@example.test")
        with customer.open(f"{self.origin}/admin.html") as response:
            self.assertTrue(response.geturl().endswith("/admin-login.html"))
        with customer.open(f"{self.origin}/seller.html") as response:
            self.assertTrue(response.geturl().endswith("/seller-login.html"))

    def test_customer_registration_cannot_grant_admin_access_and_password_is_hashed(self):
        customer_signup = build_opener(HTTPCookieProcessor(CookieJar()))
        with patch.object(server, "send_verification_email") as send_email:
            registration = self._request(
                customer_signup,
                "/api/register",
                "POST",
                {
                    "name": "Ordinary Customer",
                    "email": "ordinary@example.test",
                    "password": "valid-password",
                    "role": "admin",
                    "seller_enabled": True,
                },
                202,
            )
        self.assertTrue(registration["verificationRequired"])
        self.assertIsNone(self._request(customer_signup, "/api/session")["account"])
        self._request(
            customer_signup,
            "/api/verify-email",
            "POST",
            {"email": "ordinary@example.test", "code": send_email.call_args.args[1]},
        )
        account = self._request(customer_signup, "/api/session")["account"]

        self.assertFalse(account["isAdmin"])
        self.assertFalse(account["isSeller"])
        with server.connect_db() as connection:
            user = connection.execute(
                "SELECT role, seller_enabled, password_salt, password_hash FROM users WHERE email=?",
                ("ordinary@example.test",),
            ).fetchone()
        self.assertEqual(user["role"], "customer")
        self.assertFalse(user["seller_enabled"])
        self.assertNotEqual(user["password_hash"], b"valid-password")
        self.assertEqual(
            user["password_hash"],
            server.password_digest("valid-password", user["password_salt"]),
        )

        self._request(
            customer_signup,
            "/api/admin/login",
            "POST",
            {"email": "ordinary@example.test", "password": "valid-password"},
            403,
        )

    def test_non_admins_cannot_reach_admin_pages_or_actions(self):
        anonymous = build_opener(HTTPCookieProcessor(CookieJar()))
        customer = self._register("ordinary@example.test")
        admin_routes = (
            ("GET", "/api/admin/orders"),
            ("GET", "/api/admin/users"),
            ("GET", "/api/admin/products"),
            ("POST", "/api/admin/products"),
            ("POST", "/api/admin/products/bulk", {}),
            ("POST", "/api/admin/product-images"),
            ("PUT", "/api/admin/products/not-a-product", {}),
            ("PUT", "/api/admin/orders/not-an-order/status", {"status": "processing"}),
            ("DELETE", "/api/admin/products/not-a-product"),
        )

        for opener in (anonymous, customer, self.seller):
            expected_status = 401 if opener is anonymous else 403
            for method, path, *body in admin_routes:
                with self.subTest(role=opener, method=method, path=path):
                    self._request(
                        opener,
                        path,
                        method,
                        body[0] if body else None,
                        expected_status,
                    )

        with customer.open(f"{self.origin}/admin.html") as response:
            self.assertTrue(response.geturl().endswith("/admin-login.html"))

    def test_sellers_can_only_view_orders_containing_their_products(self):
        seller_product = self._request(
            self.seller,
            "/api/seller/products",
            "POST",
            self._product_payload(),
            201,
        )["product"]
        other_product_payload = self._product_payload()
        other_product_payload["name"] = "Other Seller Product"
        other_product_payload["variants"][0]["sku"] = "OTHER-SELLER-M-NAT"
        other_product = self._request(
            self.admin,
            "/api/admin/products",
            "POST",
            other_product_payload,
            201,
        )["product"]
        buyer = self._register("buyer@example.test")
        order_payload = {
            "customerName": "Northgate Buyer",
            "deliveryEmail": "buyer@example.test",
            "phone": "555-0101",
            "address": {"street": "2 Sample Road", "city": "Manila", "postalCode": "1001"},
            "paymentMethod": "cod",
            "items": [
                {
                    "id": seller_product["id"],
                    "variantId": seller_product["variants"][0]["id"],
                    "quantity": 1,
                },
                {
                    "id": other_product["id"],
                    "variantId": other_product["variants"][0]["id"],
                    "quantity": 1,
                },
            ],
        }
        order = self._request(buyer, "/api/orders", "POST", order_payload, 201)["order"]

        seller_orders = self._request(self.seller, "/api/seller/orders")["orders"]
        self.assertEqual(len(seller_orders), 1)
        self.assertEqual(seller_orders[0]["id"], order["id"])
        self.assertEqual([item["name"] for item in seller_orders[0]["items"]], [seller_product["name"]])
        self.assertEqual(seller_orders[0]["subtotal"], seller_product["price"])
        self.assertEqual(seller_orders[0]["total"], seller_product["price"])
        with server.connect_db() as connection:
            connection.execute("DELETE FROM products WHERE id=?", (seller_product["id"],))
        retained_order = self._request(self.seller, "/api/seller/orders")["orders"][0]
        self.assertEqual(retained_order["items"][0]["name"], seller_product["name"])

        self._request(self.admin, "/api/seller/orders", expected_status=403)
        self._request(buyer, "/api/seller/orders", expected_status=403)
        anonymous = build_opener(HTTPCookieProcessor(CookieJar()))
        self._request(anonymous, "/api/seller/orders", expected_status=401)

    def test_customers_can_review_delivered_purchases_and_reviews_are_public(self):
        product = self._request(
            self.admin,
            "/api/admin/products",
            "POST",
            self._product_payload(),
            201,
        )["product"]
        buyer = self._register("reviewer@example.test")
        order_payload = {
            "customerName": "Northgate Reviewer",
            "deliveryEmail": "reviewer@example.test",
            "phone": "555-0102",
            "address": {"street": "5 Sample Road", "city": "Manila", "postalCode": "1002"},
            "paymentMethod": "cod",
            "items": [{"id": product["id"], "variantId": product["variants"][0]["id"], "quantity": 1}],
        }
        order = self._request(buyer, "/api/orders", "POST", order_payload, 201)["order"]
        review_payload = {
            "orderId": order["id"],
            "productId": product["id"],
            "rating": 5,
            "comment": "Comfortable fit and excellent quality.",
        }
        self._request(buyer, "/api/product-reviews", "POST", review_payload, 403)

        self._request(
            self.admin,
            f"/api/admin/orders/{order['id']}/status",
            "PUT",
            {"status": "Shipped"},
        )
        self._request(
            self.admin,
            f"/api/admin/orders/{order['id']}/status",
            "PUT",
            {"status": "Delivered"},
        )
        self._request(buyer, "/api/product-reviews", "POST", review_payload, 200)
        updated_review = {**review_payload, "rating": 4, "comment": "Updated: comfortable fit and excellent quality."}
        self._request(buyer, "/api/product-reviews", "POST", updated_review, 200)

        buyer_order = self._request(buyer, "/api/orders")["orders"][0]
        self.assertEqual(buyer_order["items"][0]["review"]["rating"], 4)
        public_product = next(
            item
            for item in self._request(build_opener(), "/api/products")["products"]
            if item["id"] == product["id"]
        )
        self.assertEqual(public_product["rating"], 4.0)
        self.assertEqual(public_product["reviewCount"], 1)
        self.assertEqual(public_product["reviews"][0]["comment"], updated_review["comment"])
        self.assertNotIn("reviewer@example.test", json.dumps(public_product["reviews"]))

        another_customer = self._register("other-reviewer@example.test")
        self._request(another_customer, "/api/product-reviews", "POST", review_payload, 403)

    def test_existing_session_uses_current_server_side_role(self):
        self._request(self.admin, "/api/session")
        with server.connect_db() as connection:
            connection.execute(
                "UPDATE users SET role='customer' WHERE email=?",
                ("admin@example.test",),
            )

        self._request(self.admin, "/api/admin/orders", expected_status=403)

    def test_seller_registration_requires_email_verification_before_session(self):
        self.assertTrue(self._request(self.admin, "/api/health")["sellerRegistration"])
        self.assertTrue(self._request(self.admin, "/api/health")["emailOtp"])
        self.assertTrue(self._request(self.admin, "/api/health")["sellerOrders"])
        self.assertTrue(self._request(self.admin, "/api/health")["productReviews"])
        seller_signup = build_opener(HTTPCookieProcessor(CookieJar()))
        with patch.object(server, "send_verification_email") as send_email:
            registration = self._request(
                seller_signup,
                "/api/seller/register",
                "POST",
                {"name": "New Seller", "email": "new-seller@example.test", "password": "valid-password"},
                202,
            )

        self.assertTrue(registration["verificationRequired"])
        self.assertIsNone(self._request(seller_signup, "/api/session")["account"])
        self._request(
            seller_signup,
            "/api/seller/login",
            "POST",
            {"email": "new-seller@example.test", "password": "valid-password"},
            403,
        )
        account = self._request(
            seller_signup,
            "/api/verify-email",
            "POST",
            {"email": "new-seller@example.test", "code": send_email.call_args.args[1]},
        )["account"]
        self.assertTrue(account["isSeller"])
        self.assertFalse(account["isAdmin"])
        self.assertEqual(account["name"], "New Seller")
        self.assertTrue(self._request(seller_signup, "/api/session")["account"]["isSeller"])
        self._request(
            seller_signup,
            "/api/seller/register",
            "POST",
            {"name": "Another Name", "email": "new-seller@example.test", "password": "valid-password"},
            409,
        )

    def test_email_verification_rejects_bad_codes_and_resend_is_rate_limited(self):
        registration = build_opener(HTTPCookieProcessor(CookieJar()))
        with patch.object(server, "send_verification_email") as send_email:
            self._request(
                registration,
                "/api/register",
                "POST",
                {"name": "Verify Me", "email": "verify@example.test", "password": "valid-password"},
                202,
            )
            code = send_email.call_args.args[1]
            self._request(
                registration,
                "/api/verify-email",
                "POST",
                {"email": "verify@example.test", "code": "000000" if code != "000000" else "000001"},
                400,
            )
            self._request(
                registration,
                "/api/verify-email/resend",
                "POST",
                {"email": "verify@example.test"},
                429,
            )
            self._request(
                registration,
                "/api/verify-email",
                "POST",
                {"email": "verify@example.test", "code": code},
            )

    def test_smtp_failure_does_not_claim_signup_email_was_sent(self):
        registration = build_opener(HTTPCookieProcessor(CookieJar()))
        with patch.object(
            server,
            "send_verification_email",
            side_effect=server.EmailDeliveryError("SMTP is not configured."),
        ):
            response = self._request(
                registration,
                "/api/register",
                "POST",
                {"name": "Pending Member", "email": "pending@example.test", "password": "valid-password"},
                503,
            )

        self.assertTrue(response["verificationRequired"])
        self.assertEqual(response["email"], "pending@example.test")
        self.assertIn("SMTP is not configured.", response["error"])
        with server.connect_db() as connection:
            user = connection.execute(
                "SELECT email_verified FROM users WHERE email=?",
                ("pending@example.test",),
            ).fetchone()
            challenge = connection.execute(
                "SELECT last_sent_at FROM email_verifications WHERE user_id=("
                "SELECT id FROM users WHERE email=? COLLATE NOCASE)",
                ("pending@example.test",),
            ).fetchone()
        self.assertFalse(user["email_verified"])
        self.assertEqual(challenge["last_sent_at"], 0)

    def test_variant_checkout_decrements_stock_and_keeps_order_snapshot(self):
        product = self._request(
            self.admin,
            "/api/admin/products",
            "POST",
            self._product_payload(),
            201,
        )["product"]
        variant = product["variants"][0]
        order_payload = {
            "customerName": "Northgate Tester",
            "deliveryEmail": "admin@example.test",
            "phone": "555-0100",
            "address": {"street": "1 Sample Road", "city": "Manila", "postalCode": "1000"},
            "paymentMethod": "cod",
            "items": [{"id": product["id"], "variantId": variant["id"], "quantity": 1}],
        }
        order = self._request(self.admin, "/api/orders", "POST", order_payload, 201)["order"]
        self.assertEqual(order["items"][0]["variantSku"], "LINEN-M-NAT")
        self.assertEqual(order["items"][0]["size"], "M")

        products = self._request(self.admin, "/api/admin/products")["products"]
        updated = next(item for item in products if item["id"] == product["id"])
        self.assertEqual(updated["variants"][0]["stock"], 1)

    def test_product_level_stock_is_checked_and_decremented(self):
        payload = self._product_payload()
        payload["name"] = "Unisex Canvas Tote"
        payload["stock"] = 1
        payload["variants"] = []
        product = self._request(self.admin, "/api/admin/products", "POST", payload, 201)["product"]
        order_payload = {
            "customerName": "Northgate Tester",
            "deliveryEmail": "admin@example.test",
            "phone": "555-0100",
            "address": {"street": "1 Sample Road", "city": "Manila", "postalCode": "1000"},
            "paymentMethod": "cod",
            "items": [{"id": product["id"], "quantity": 2}],
        }
        self._request(self.admin, "/api/orders", "POST", order_payload, 400)
        order_payload["items"][0]["quantity"] = 1
        self._request(self.admin, "/api/orders", "POST", order_payload, 201)
        updated = next(
            item
            for item in self._request(self.admin, "/api/admin/products")["products"]
            if item["id"] == product["id"]
        )
        self.assertEqual(updated["stock"], 0)

    def test_quick_and_bulk_stock_updates_are_recorded(self):
        product = self._request(
            self.admin,
            "/api/admin/products",
            "POST",
            self._product_payload(),
            201,
        )["product"]
        variant_id = product["variants"][0]["id"]
        self._request(
            self.admin,
            f"/api/admin/products/{product['id']}/stock/{variant_id}",
            "PUT",
            {"stock": 7},
        )
        self._request(
            self.admin,
            "/api/admin/products/bulk",
            "POST",
            {"productIds": [product["id"]], "action": "stock", "stock": 4},
        )
        updated = next(
            item
            for item in self._request(self.admin, "/api/admin/products")["products"]
            if item["id"] == product["id"]
        )
        self.assertEqual(updated["variants"][0]["stock"], 4)
        self.assertTrue(any("changed from 2 to 7" in event["details"] for event in updated["activity"]))
        self.assertTrue(any("Stock changed to 4" in event["details"] for event in updated["activity"]))

    def test_upload_saves_validated_image_as_file(self):
        image_bytes = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII="
        )
        uploaded = self._request(
            self.admin,
            "/api/admin/product-images",
            "POST",
            {"files": [{"type": "image/png", "data": base64.b64encode(image_bytes).decode()}]},
            201,
        )["images"][0]
        self.assertTrue((Path(server.ROOT) / uploaded.lstrip("/")).is_file())
        self._request(
            self.admin,
            "/api/admin/product-images",
            "POST",
            {"files": [{"type": "image/png", "data": base64.b64encode(b"not an image").decode()}]},
            400,
        )


if __name__ == "__main__":
    unittest.main()

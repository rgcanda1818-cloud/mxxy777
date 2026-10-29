import sqlite3
import unittest

import server


class RecordingPostgresConnection:
    def __init__(self):
        self.statements = []

    def execute(self, statement, parameters=()):
        self.statements.append((statement, parameters))
        return object()

    def executemany(self, statement, parameter_rows):
        self.statements.append((statement, list(parameter_rows)))
        return object()


class DatabaseConnectionTests(unittest.TestCase):
    def test_postgres_translates_schema_and_case_insensitive_emails(self):
        statement = server.DatabaseConnection._postgres_statement(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT COLLATE NOCASE, password_salt BLOB)"
        )

        self.assertIn("id SERIAL PRIMARY KEY", statement)
        self.assertIn("password_salt BYTEA", statement)
        self.assertNotIn("COLLATE NOCASE", statement)
        self.assertIn("LOWER(email) = LOWER(?)", server.DatabaseConnection._postgres_statement(
            "SELECT * FROM users WHERE email = ? COLLATE NOCASE"
        ))

    def test_postgres_execute_translates_parameters(self):
        backend = RecordingPostgresConnection()
        connection = server.DatabaseConnection(backend, postgres=True)
        connection.execute("SELECT * FROM users WHERE email = ? COLLATE NOCASE", ("person@example.test",))

        self.assertEqual(
            backend.statements,
            [("SELECT * FROM users WHERE LOWER(email) = LOWER(%s)", ("person@example.test",))],
        )

    def test_postgres_executemany_ignores_duplicate_products(self):
        backend = RecordingPostgresConnection()
        connection = server.DatabaseConnection(backend, postgres=True)
        connection.executemany(
            "INSERT OR IGNORE INTO products (id, name) VALUES (?, ?)",
            [("one", "One"), ("two", "Two")],
        )

        self.assertEqual(
            backend.statements,
            [("INSERT INTO products (id, name) VALUES (%s, %s) ON CONFLICT DO NOTHING", [("one", "One"), ("two", "Two")])],
        )

    def test_sqlite_connection_facade_preserves_sqlite_behavior(self):
        backend = sqlite3.connect(":memory:")
        backend.row_factory = sqlite3.Row
        connection = server.DatabaseConnection(backend, postgres=False)
        connection.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL)")
        connection.execute("INSERT INTO users (email) VALUES (?)", ("person@example.test",))

        row = connection.execute("SELECT email FROM users WHERE id = ?", (1,)).fetchone()

        self.assertEqual(row["email"], "person@example.test")
        backend.close()


if __name__ == "__main__":
    unittest.main()

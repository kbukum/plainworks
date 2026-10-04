import { decodeMockIdpData, emptyMockIdpData, type MockIdpState } from "@plainworks/mocks/idp"
import { type CustodyDatabaseOptions, openCustodyDatabase } from "./database"

/** Local demo-provider state; never a production provider database. */
export type SqliteMockIdpStateOptions = Omit<CustodyDatabaseOptions, "maxPageCount">

const CONTEXT = "plainworks:mock-idp:1"

/**
 * One encrypted, bounded fixture document with synchronous atomic mutations. Independent providers
 * borrow separate handles over shared data. Lock waits are capped at 50 ms; callers own close.
 */
export function createSqliteMockIdpState(options: SqliteMockIdpStateOptions): MockIdpState {
  const custody = openCustodyDatabase({ ...options, maxPageCount: 1024 })
  const { database: db, cipher } = custody
  try {
    db.transaction(() => {
      db.exec(
        "CREATE TABLE IF NOT EXISTS mock_idp_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)",
      )
      const payload: unknown = db
        .prepare("SELECT payload FROM mock_idp_state WHERE id=1")
        .pluck()
        .get()
      if (payload === undefined) {
        db.prepare("INSERT INTO mock_idp_state VALUES (1, ?)").run(
          cipher.seal(CONTEXT, JSON.stringify(emptyMockIdpData())),
        )
      } else if (typeof payload === "string") {
        decodeMockIdpData(cipher.open(CONTEXT, payload))
      } else throw new Error("invalid mock IdP fixture row")
    }).immediate()
  } catch (cause) {
    custody.close()
    throw cause
  }
  const transact: MockIdpState["transact"] = (operation) => {
    if (!db.open) throw new Error("mock IdP state is closed")
    return db
      .transaction(() => {
        const payload: unknown = db
          .prepare("SELECT payload FROM mock_idp_state WHERE id=1")
          .pluck()
          .get()
        if (typeof payload !== "string") throw new Error("missing mock IdP fixture row")
        const data = decodeMockIdpData(cipher.open(CONTEXT, payload))
        const result = operation(data)
        const encoded = JSON.stringify(data)
        decodeMockIdpData(encoded)
        db.prepare("UPDATE mock_idp_state SET payload=? WHERE id=1").run(
          cipher.seal(CONTEXT, encoded),
        )
        return result
      })
      .immediate()
  }
  return { transact, close: custody.close }
}

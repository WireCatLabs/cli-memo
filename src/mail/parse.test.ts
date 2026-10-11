import { expect, it } from "vitest"
import { parseMail } from "./parse.js"

const list = (...people: [string, string][]) => ({
  Address: { List: people.map(([name, address]) => ({ name, address })) },
})

it("keeps To and Cc apart", () => {
  const parsed = parseMail(
    JSON.stringify({
      parts: [
        {
          headers: [
            { name: "to", value: list(["Bob Sample", "bob@example.com"]) },
            { name: "cc", value: list(["Kai Sample", "kai@example.com"]) },
          ],
          body: { Text: "Synthetic body" },
        },
      ],
      text_body: [0],
      html_body: [],
    }),
  )
  expect(parsed.to).toEqual([{ email: "bob@example.com", name: "Bob Sample" }])
  expect(parsed.cc).toEqual([{ email: "kai@example.com", name: "Kai Sample" }])
})

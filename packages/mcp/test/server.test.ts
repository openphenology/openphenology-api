import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { expect, test } from "vitest";
import { createServer, SERVER_INFO } from "../src/index.ts";

test("an assistant can connect and read the server's name", async () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  expect(client.getServerVersion()).toMatchObject(SERVER_INFO);
  await client.close();
});

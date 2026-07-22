import { describe, expect, it } from "vitest";
import { createPendingDocument, deleteDocument, getDocument } from "./store.js";
import { enqueueDocument } from "./queue.js";

describe("document processing queue", () => {
  it("moves a local job from queued to indexed", async () => {
    const document = createPendingDocument({
      name: "queue-test.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("Asset P-999 bearing temperature is 70 C.")
    });
    try {
      expect(getDocument(document.id).status).toBe("queued");
      await enqueueDocument(document.id);
      for (let attempt = 0; attempt < 20 && getDocument(document.id).status !== "indexed"; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(getDocument(document.id).status).toBe("indexed");
      expect(getDocument(document.id).chunkCount).toBe(1);
    } finally {
      deleteDocument(document.id);
    }
  });
});

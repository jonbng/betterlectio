import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { CKE_DARK_CSS } from "./ckeditor-dark";

describe("CKEditor dark theme", () => {
  test("themes the editable document and adapts explicit black text", () => {
    assert.match(CKE_DARK_CSS, /body\.cke_editable/);
    assert.match(CKE_DARK_CSS, /background-color: oklch/);
    assert.match(CKE_DARK_CSS, /color: black/);
    assert.match(CKE_DARK_CSS, /color: rgb\(0, 0, 0\)/);
    assert.match(CKE_DARK_CSS, /font\[color=/);
  });
});

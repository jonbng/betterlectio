import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DOMParser } from "linkedom";
import { parseElevfeedbackDetail } from "./elevfeedback";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html") as unknown as Document;
}

describe("parseElevfeedbackDetail", () => {
  test("never treats Lectio's hidden edit-mode validator or backup alert as saved content", () => {
    const doc = parse(`
      <div id="s_m_Content_Content_Elevindhold_tocAndToolbar_inlineHomeworkDiv">
        <div class="ls-paper" id="student-paper">
          <div class="ls-section-subgroup-heading">
            <span data-lectioContextCard="S123">Student Name</span>
          </div>
          <div class="elevindholdContainer">
            <div id="editor_backupContentDiv_0" class="alert" style="display:none">Autobackup warning</div>
            <span
              id="editor_lv_0"
              class="alert"
              maxlength="1100"
              displayupdatefunction="LCCommentBlockUtility.CustomValidator_LCDocumentEditorCommentBlock_UpdateDisplay"
              style="visibility:hidden"
            >hejxxy</span>
            <textarea id="editor_ed_0" lectio-role="editor-textarea"></textarea>
            <input id="editor_isDirty_0" type="hidden" />
          </div>
        </div>
      </div>
    `);

    const detail = parseElevfeedbackDetail(doc, "https://www.lectio.dk/lectio/94/aktivitet/aktivitetforside2.aspx?lectab=elevindhold");

    assert.equal(detail.writable, true);
    assert.equal(detail.contentUnavailable, true);
    assert.equal(detail.empty, true);
    assert.deepEqual(detail.sections, []);
  });

  test("reads rendered view-mode content", () => {
    const doc = parse(`
      <div id="s_m_Content_Content_Elevindhold_tocAndToolbar_inlineHomeworkDiv">
        <div class="ls-paper" id="student-paper">
          <div class="ls-section-subgroup-heading">
            <span data-lectioContextCard="S123">Student Name</span>
          </div>
          <div class="elevindholdContainer"><p>Saved answer</p></div>
        </div>
      </div>
    `);

    const detail = parseElevfeedbackDetail(doc, "https://www.lectio.dk/lectio/94/aktivitet/aktivitetforside2.aspx?lectab=elevindhold");
    assert.equal(detail.contentUnavailable, false);
    assert.equal(detail.empty, false);
    assert.equal(detail.sections.length, 1);
    assert.equal(detail.sections[0]?.kind, "student");
    assert.match(detail.sections[0]?.contentHtml ?? "", /Saved answer/);
  });
});

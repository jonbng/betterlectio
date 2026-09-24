import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DOMParser } from "linkedom";
import { parseElevfeedbackDetail } from "./elevfeedback";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html") as unknown as Document;
}

describe("parseElevfeedbackDetail", () => {
  test("reads saved content and write access from Lectio edit-mode HTML", () => {
    const doc = parse(`
      <div id="s_m_Content_Content_Elevindhold_tocAndToolbar_inlineHomeworkDiv">
        <div class="ls-paper" id="student-paper">
          <div class="ls-section-subgroup-heading">
            <span data-lectioContextCard="S123">Student Name</span>
          </div>
          <div class="elevindholdContainer">
            <div id="editor_backupContentDiv_0" class="alert" style="display:none"></div>
            <span id="editor_lv_0" class="alert" style="visibility:hidden">Saved answer</span>
            <textarea id="editor_ed_0" lectio-role="editor-textarea"></textarea>
            <input id="editor_isDirty_0" type="hidden" />
          </div>
        </div>
      </div>
    `);

    const detail = parseElevfeedbackDetail(doc, "https://www.lectio.dk/lectio/94/aktivitet/aktivitetforside2.aspx?lectab=elevindhold");

    assert.equal(detail.writable, true);
    assert.equal(detail.empty, false);
    assert.equal(detail.sections.length, 1);
    assert.equal(detail.sections[0]?.kind, "student");
    assert.match(detail.sections[0]?.contentHtml ?? "", /Saved answer/);
  });

  test("does not render an empty editor fallback as content", () => {
    const doc = parse(`
      <div id="s_m_Content_Content_Elevindhold_tocAndToolbar_inlineHomeworkDiv">
        <div class="ls-paper">
          <span id="editor_lv_0" class="alert">&nbsp;</span>
          <textarea lectio-role="editor-textarea"></textarea>
        </div>
      </div>
    `);

    const detail = parseElevfeedbackDetail(doc, "https://www.lectio.dk/lectio/94/aktivitet/aktivitetforside2.aspx?lectab=elevindhold");
    assert.equal(detail.writable, true);
    assert.equal(detail.empty, true);
    assert.deepEqual(detail.sections, []);
  });
});

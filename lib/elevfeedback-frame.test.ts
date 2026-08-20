import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DOMParser as LinkedomDOMParser } from "linkedom";

import { prepareElevfeedbackIframeDocument } from "./elevfeedback-frame";

function parse(html: string): Document {
  return new LinkedomDOMParser().parseFromString(html, "text/html") as unknown as Document;
}

function editorPageHtml(): string {
  return `<!DOCTYPE html>
<html>
<body class="masterbody">
  <div id="modalBackgroundID"></div>
  <nav id="mobilMereSheetMenu">Mere</nav>
  <div id="masterContent" class="ls-master-container1">
    <form id="aspnetForm" class="ls-master-container2">
      <div class="aspNetHidden">
        <input type="hidden" name="__VIEWSTATE" value="x" />
      </div>
      <header role="banner">
        <div id="s_m_masterHeaderDiv" class="ls-master-header">School</div>
        <nav id="s_m_mastermenu" class="lectioToolbar">Forside Skema Hovedmenu</nav>
      </header>
      <div id="s_m_outerContentFrameDiv">
        <div class="ls-content-container">
          <div id="s_m_HeaderContent_subnav_div" class="ls-master-pageheader">
            <div id="s_m_HeaderContent_MainTitle">Aktivitetsforside</div>
            <nav>Forside Skema Studieplan Fravær</nav>
          </div>
          <div id="contenttable" class="ls-content">
            <nav class="ls-std-rowblock ls-std-toolbar-filled">
              <div id="s_m_Content_Content_entityNavDiv">Skemaaktivitet</div>
              <div id="s_m_Content_Content_holdNavDiv">Holdets aktiviteter</div>
            </nav>
            <div id="PrintAktivititetArea" class="ls-toccontent-container">
              <div class="ls-tabs4">
                <div class="lectioTabToolbar">
                  <a href="#">Indhold</a>
                  <a href="#">Elevfeedback</a>
                </div>
                <div class="lectioTabContent">
                  <div class="ls-texteditor-container">
                    <div class="ls-texteditor-toolbarOuterContainer toolbar">
                      <div id="toolbarcontent"></div>
                    </div>
                    <div class="ls-tocandcontentparent">
                      <div class="ls-tocContainer-outer">
                        <div class="nowrap">
                          <a id="s_m_Content_Content_Elevindhold_tocAndToolbar_elevindholdLV_ctrl1_NytElevindholdBtn" href="#">Nyt</a>
                        </div>
                      </div>
                      <div id="s_m_Content_Content_Elevindhold_tocAndToolbar_outerContentContainer">
                        <div id="ElevContentContainer" class="ls-texteditor-paper-container">
                          <div class="ls-paper-header">fr 22/5 08:10 - 14:00</div>
                          <div class="ls-paper">
                            <textarea lectio-role="editor-textarea"></textarea>
                          </div>
                          <div class="nb_type_information">Her kan elever skrive noter</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <footer id="s_m_masterFooter">Footer</footer>
    </form>
  </div>
</body>
</html>`;
}

function isHidden(el: Element | null): boolean {
  assert.ok(el);
  return el.getAttribute("aria-hidden") === "true" || (el as HTMLElement).style.display === "none";
}

describe("prepareElevfeedbackIframeDocument", () => {
  test("hides Lectio nav chrome and keeps the editor island", () => {
    const doc = parse(editorPageHtml());
    prepareElevfeedbackIframeDocument(doc, false);

    assert.ok(doc.documentElement.classList.contains("bl-elevfeedback-frame"));
    assert.ok(isHidden(doc.getElementById("s_m_mastermenu")));
    assert.ok(isHidden(doc.getElementById("s_m_HeaderContent_subnav_div")));
    assert.ok(isHidden(doc.querySelector("header[role='banner']")));
    assert.ok(isHidden(doc.getElementById("s_m_masterFooter")));
    assert.ok(isHidden(doc.querySelector(".lectioTabToolbar")));
    assert.ok(isHidden(doc.querySelector(".ls-tocContainer-outer")));
    assert.ok(isHidden(doc.querySelector(".ls-paper-header")));
    assert.ok(isHidden(doc.querySelector("nav.ls-std-toolbar-filled")));

    const island = doc.querySelector(".ls-texteditor-container");
    assert.ok(island);
    assert.notEqual((island as HTMLElement).style.display, "none");
    assert.ok(doc.querySelector("textarea[lectio-role='editor-textarea']"));
    assert.equal(doc.querySelector("input[name='__VIEWSTATE']")?.getAttribute("value"), "x");
  });

  test("moves Nyt out of the hidden TOC onto the paper", () => {
    const doc = parse(editorPageHtml());
    prepareElevfeedbackIframeDocument(doc, false);

    const nyt = doc.getElementById("bl-elevfeedback-nyt");
    assert.ok(nyt);
    assert.ok(doc.getElementById("ElevContentContainer")?.contains(nyt));
    assert.ok(nyt.querySelector("[id$='NytElevindholdBtn']"));
    assert.equal(nyt.getAttribute("aria-hidden"), null);
  });
});

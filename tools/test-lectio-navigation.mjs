import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const build = await Bun.build({
  entrypoints: ['./lib/lectio-navigation.ts'],
  target: 'browser',
  format: 'cjs',
});
if (!build.success) throw new Error('Could not bundle navigation parser');
const parserSource = `var module = { exports: {} }; var exports = module.exports;\n${await build.outputs[0].text()}\nwindow.BetterLectioNavigation = module.exports;`;

const shell = (pageHeader) => `<!doctype html><html><body>
  <span class="ls-master-header-institution-name">Testskolen</span>
  <nav id="s_m_mastermenu"><div>
    <div class="buttonoutlined"><a id="home" href="/lectio/1/forside.aspx">Forside</a></div>
    <div class="buttonoutlined"><a id="schedule" href="/lectio/1/SkemaNy.aspx">Skema</a></div>
  </div><div><div class="buttonlink"><a id="s_m_mastersearchbtn" href="#" onclick="return false">Søg</a></div></div></nav>
  ${pageHeader}
</body></html>`;

const student = shell(`<div class="ls-master-pageheader">
  <div class="thumber"><img src="/student.jpg"></div>
  <div class="maintitle" data-lectioContextCard="S123">Eleven Ada Lovelace, 2x - Fravær</div>
  <div class="ls-subnav1">
    <div class="buttonlink"><a href="/lectio/1/forside.aspx">Forside</a></div>
    <div class="buttonlink ls-subnav-active"><a href="/lectio/1/fravaer.aspx">Fravær</a></div>
  </div>
  <div class="ls-subnav2">
    <div class="buttonlink"><a href="/lectio/1/oversigt.aspx">Oversigt</a></div>
    <div class="buttonlink ls-subnav-active"><a href="/lectio/1/aarsager.aspx">Fraværsårsager</a></div>
  </div>
</div>`);

const hold = shell(`<div class="ls-master-pageheader">
  <div class="maintitle" data-lectioContextCard="HE456">Holdet 2x MA - Skema</div>
  <div class="ls-subnav1">
    <div class="buttonlink ls-subnav-active"><a href="/lectio/1/SkemaNy.aspx?holdelementid=456">Skema</a></div>
    <div class="buttonlink"><a href="/lectio/1/members.aspx?holdelementid=456">Lærere-Elever</a></div>
  </div>
</div>`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function parse(html) {
  await page.setContent(html);
  await page.addScriptTag({ content: parserSource });
  return page.evaluate(() => BetterLectioNavigation.parseLectioNavigation(document));
}

const studentResult = await parse(student);
assert.equal(studentResult.schoolName, 'Testskolen');
assert.equal(studentResult.contextId, 'S123');
assert.equal(studentResult.primaryItems.length, 2);
assert.equal(studentResult.primaryItems[1].active, true);
assert.equal(studentResult.secondaryItems[1].label, 'Fraværsårsager');
assert.equal(studentResult.searchItem.nativeAction, true);

assert.equal(
  await page.evaluate(() => BetterLectioNavigation.isSecondaryNavigationMerged('/lectio/1/subnav/fravaerelev.aspx')),
  true,
);
assert.equal(
  await page.evaluate(() => BetterLectioNavigation.isSecondaryNavigationMerged('/lectio/1/subnav/fravaerelev_fravaersaarsager.aspx')),
  true,
);
assert.equal(
  await page.evaluate(() => BetterLectioNavigation.isSecondaryNavigationMerged('/lectio/1/indstillinger/studentIndstillinger.aspx')),
  false,
);

const holdResult = await parse(hold);
assert.equal(holdResult.contextId, 'HE456');
assert.deepEqual(holdResult.primaryItems.map((item) => item.label), ['Skema', 'Lærere-Elever']);
assert.equal(holdResult.secondaryItems.length, 0);

const standaloneResult = await parse(shell('<div class="ls-master-pageheader"><div class="maintitle">Find skema</div></div>'));
assert.equal(standaloneResult.primaryItems.length, 0);
assert.equal(standaloneResult.secondaryItems.length, 0);

for (const file of process.argv.slice(2)) {
  const html = await Bun.file(file).text();
  const result = await parse(html);
  assert.ok(result.schoolName, `${file}: missing school name`);
  assert.ok(result.globalItems.length >= 2, `${file}: missing global navigation`);
  console.log(`${file}: ${result.primaryItems.length} primary, ${result.secondaryItems.length} secondary`);
}

await browser.close();
console.log('Navigation parser fixtures passed');
